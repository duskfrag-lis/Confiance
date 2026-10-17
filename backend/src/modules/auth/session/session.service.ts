import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { CookieOptions, Request, Response } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthTokensService } from './auth-tokens.service';
import {
  ACCESS_COOKIE,
  AccountStatus,
  authError,
  ProfileName,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../auth.constants';

type Db = PrismaService | Prisma.TransactionClient;

export interface AccessTokenPayload {
  sub: string;
  profile: ProfileName;
  adm: boolean;
  /** Fila de user_sessions: JwtStrategy rechaza el token en cuanto esa sesión se cierra */
  sid: string;
}

/** Otra pestaña del mismo navegador que renueva con el token anterior dentro de este margen no es un robo. */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Sesión sin "Recuérdame": dura como máximo esto y su cookie no lleva maxAge,
 * así que el navegador la borra al cerrarse.
 */
export const BROWSER_SESSION_MS = 12 * 60 * 60 * 1000;

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDuration(value: string) {

  const match = /^(\d+)([smhd])$/.exec(value.trim());

  if (!match) throw new Error(`Duración inválida: ${value}`);

  return Number(match[1]) * UNITS[match[2]];
}

const sessionWithStatus = {
  users: { select: { account_statuses: { select: { status_name: true } } } },
} satisfies Prisma.user_sessionsInclude;

type SessionRow = Prisma.user_sessionsGetPayload<{ include: typeof sessionWithStatus }>;

/**
 * Sesiones por dispositivo (HU-03, RFC 9700): cada inicio de sesión es una fila de user_sessions con
 * su refresh token rotativo. El access token lleva el id de la fila, así que cerrar una sesión la
 * corta al instante. "Recuérdame" vence tras JWT_REFRESH_EXPIRES sin usarse: cada
 * renovación reinicia el plazo.
 */
@Injectable()
export class SessionService {

  private accessMs: number;
  private rememberMs: number;
  private browserMs: number;
  private secure: boolean;

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {

    this.accessMs = parseDuration(this.config.get<string>('JWT_ACCESS_EXPIRES')!);
    this.rememberMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES')!);
    this.browserMs = Math.min(BROWSER_SESSION_MS, this.rememberMs);
    this.secure = this.config.get('NODE_ENV') === 'production';
  }

  /** Abre una sesión nueva (un dispositivo más) y devuelve el perfil activo, para redirigir a su inicio. */
  async start(res: Response, userId: bigint, remember: boolean): Promise<ProfileName> {

    const refresh = newRefreshToken();
    const now = new Date();

    const session = await this.prisma.user_sessions.create({
      data: {
        user_id: userId,
        refresh_token_hash: AuthTokensService.hash(refresh),
        remember,
        last_used_at: now,
        expires_at: this.expiresAt(remember, now),
      },
      select: { session_id: true },
    });

    const profile = await this.reissueAccess(res, userId, session.session_id);
    this.setRefreshCookie(res, refresh, remember);

    return profile;
  }

  async reissueAccess(res: Response, userId: bigint, sessionId: bigint): Promise<ProfileName> {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: { active_profiles: true },
    });

    const payload: AccessTokenPayload = {
      sub: user.user_id.toString(),
      profile: user.active_profiles.profile_name as ProfileName,
      adm: user.is_admin,
      sid: sessionId.toString(),
    };

    const access = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(this.accessMs / 1000),
    });

    // Sin maxAge: el JWT ya vence solo, y así la cookie no sobrevive al cierre del navegador en una
    // sesión sin "Recuérdame". En una que sí, el primer 401 tras reabrir lo renueva el refresh.
    res.cookie(ACCESS_COOKIE, access, this.cookie('/'));

    return payload.profile;
  }

  async rotate(req: Request, res: Response) {

    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (!raw) throw this.expired(res);

    const hash = AuthTokensService.hash(raw);

    const current = await this.prisma.user_sessions.findUnique({
      where: { refresh_token_hash: hash },
      include: sessionWithStatus,
    });

    if (current) return this.rotateCurrent(current, hash, res);

    const previous = await this.prisma.user_sessions.findFirst({
      where: { previous_token_hash: hash },
      include: sessionWithStatus,
    });

    if (!previous || !this.usable(previous)) throw this.expired(res);

    if (previous.rotated_at && Date.now() - previous.rotated_at.getTime() < REFRESH_REUSE_GRACE_MS) {

      return this.shareRotation(previous, res);
    }

    // Token ya rotado que vuelve a aparecer: lo tiene otra persona. Se cierra solo esa sesión
    // (RFC 9700); las de los demás dispositivos siguen abiertas.
    await this.prisma.user_sessions.update({
      where: { session_id: previous.session_id },
      data: { revoked_at: new Date() },
    });

    throw this.expired(res);
  }

  private async rotateCurrent(session: SessionRow, hash: string, res: Response) {

    if (!this.usable(session)) throw this.expired(res);

    const refresh = newRefreshToken();
    const now = new Date();

    // Condicionado al hash actual: si otra petición rotó primero, esta no pisa su token
    const { count } = await this.prisma.user_sessions.updateMany({
      where: { session_id: session.session_id, refresh_token_hash: hash, revoked_at: null },
      data: {
        refresh_token_hash: AuthTokensService.hash(refresh),
        previous_token_hash: hash,
        rotated_at: now,
        last_used_at: now,
        expires_at: this.expiresAt(session.remember, now),
      },
    });

    if (count === 0) {

      const fresh = await this.prisma.user_sessions.findUnique({
        where: { session_id: session.session_id },
        include: sessionWithStatus,
      });

      if (!fresh || !this.usable(fresh)) throw this.expired(res);

      return this.shareRotation(fresh, res);
    }

    await this.reissueAccess(res, session.user_id, session.session_id);
    this.setRefreshCookie(res, refresh, session.remember);
  }

  /**
   * Otra pestaña del mismo navegador acaba de rotar: comparten la cookie de refresh nueva, así que
   * basta con un access token; la cookie de refresh no se toca.
   */
  private async shareRotation(session: SessionRow, res: Response) {

    await this.reissueAccess(res, session.user_id, session.session_id);
  }

  private usable(session: SessionRow) {

    return (
      !session.revoked_at &&
      session.expires_at > new Date() &&
      session.users.account_statuses.status_name !== AccountStatus.DISABLED
    );
  }

  /** HU-03 criterio 4: cierra solo la sesión de este dispositivo. */
  async end(req: Request, res: Response) {

    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (raw) {

      const hash = AuthTokensService.hash(raw);

      await this.prisma.user_sessions.updateMany({
        where: { OR: [{ refresh_token_hash: hash }, { previous_token_hash: hash }], revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }

    this.clear(res);
  }

  async endAll(res: Response, userId: bigint) {

    await this.revokeAll(userId);
    this.clear(res);
  }

  /** Cierra todas las sesiones de la cuenta (contraseña restablecida, cuenta deshabilitada, D-47). */
  async revokeAll(userId: bigint, db: Db = this.prisma) {

    await db.user_sessions.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  clear(res: Response) {

    res.clearCookie(ACCESS_COOKIE, this.cookie('/'));
    res.clearCookie(REFRESH_COOKIE, this.cookie(REFRESH_COOKIE_PATH));
  }

  private expiresAt(remember: boolean, from: Date) {

    return new Date(from.getTime() + (remember ? this.rememberMs : this.browserMs));
  }

  private setRefreshCookie(res: Response, refresh: string, remember: boolean) {

    res.cookie(REFRESH_COOKIE, refresh, this.cookie(REFRESH_COOKIE_PATH, remember ? this.rememberMs : undefined));
  }

  private expired(res: Response) {

    this.clear(res);

    return authError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }

  private cookie(path: string, maxAge?: number): CookieOptions {

    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path, maxAge };
  }
}

function newRefreshToken() {

  return randomBytes(32).toString('base64url');
}
