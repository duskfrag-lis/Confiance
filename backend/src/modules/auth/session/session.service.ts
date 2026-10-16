import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
  TokenType,
} from '../auth.constants';

export interface AccessTokenPayload {
  sub: string;
  profile: ProfileName;
  adm: boolean;
  /** Lo agrega jsonwebtoken al firmar (segundos) */
  iat?: number;
}

export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Sesión sin "recordarme": el refresh dura como máximo esto y su cookie no lleva maxAge,
 * así que el navegador la borra al cerrarse.
 */
export const BROWSER_SESSION_MS = 12 * 60 * 60 * 1000;

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDuration(value: string) {

  const match = /^(\d+)([smhd])$/.exec(value.trim());

  if (!match) throw new Error(`Duración inválida: ${value}`);

  return Number(match[1]) * UNITS[match[2]];
}

@Injectable()
export class SessionService {

  private accessMs: number;
  private refreshMs: number;
  private browserMs: number;
  private secure: boolean;

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private prisma: PrismaService,
    private tokens: AuthTokensService,
  ) {

    this.accessMs = parseDuration(this.config.get<string>('JWT_ACCESS_EXPIRES')!);
    this.refreshMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES')!);
    // Como máximo la mitad del refresh largo, para que la rotación siempre pueda distinguir las dos
    this.browserMs = Math.min(BROWSER_SESSION_MS, this.refreshMs / 2);
    this.secure = this.config.get('NODE_ENV') === 'production';
  }

  /**
   * Deja las cookies de sesión y devuelve el perfil activo (para redirigir a su inicio).
   * `remember`: true -> refresh de JWT_REFRESH_EXPIRES con cookie persistente;
   * false -> refresh corto y cookie de sesión del navegador.
   */
  async start(res: Response, userId: bigint, remember: boolean): Promise<ProfileName> {

    const profile = await this.reissueAccess(res, userId);

    const ttlMs = remember ? this.refreshMs : this.browserMs;
    const refresh = await this.tokens.issue(userId, TokenType.REFRESH_SESSION, ttlMs);

    res.cookie(REFRESH_COOKIE, refresh, this.cookie(REFRESH_COOKIE_PATH, remember ? ttlMs : undefined));

    return profile;
  }

  async reissueAccess(res: Response, userId: bigint): Promise<ProfileName> {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: { active_profiles: true },
    });

    const payload: AccessTokenPayload = {
      sub: user.user_id.toString(),
      profile: user.active_profiles.profile_name as ProfileName,
      adm: user.is_admin,
    };

    const access = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(this.accessMs / 1000),
    });

    // Sin maxAge: el JWT ya vence solo, y así la cookie no sobrevive al cierre del navegador en una
    // sesión sin "recordarme". En una recordada, el primer 401 tras reabrir lo renueva el refresh.
    res.cookie(ACCESS_COOKIE, access, this.cookie('/'));

    return payload.profile;
  }

  async rotate(req: Request, res: Response) {

    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (!raw) throw this.expired(res);

    const userId =
      (await this.tokens.consume(raw, TokenType.REFRESH_SESSION)) ?? (await this.concurrentRefresh(raw, res));

    if (userId === null) throw this.expired(res);

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: { account_statuses: true },
    });

    if (user.account_statuses.status_name === AccountStatus.DISABLED) throw this.expired(res);

    await this.start(res, userId, await this.wasRemembered(raw));
  }

  /**
   * La rotación conserva la elección de "recordarme" sin guardarla aparte: se deduce de la
   * vigencia del token que se acaba de usar. Se compara con el punto medio entre las dos
   * vigencias para que un desfase de reloj entre Node y Postgres no cambie el resultado.
   */
  private async wasRemembered(raw: string) {

    const used = await this.tokens.findUsed(raw, TokenType.REFRESH_SESSION);

    return !!used && used.ttlMs > (this.browserMs + this.refreshMs) / 2;
  }

  private async concurrentRefresh(raw: string, res: Response): Promise<bigint | null> {

    const used = await this.tokens.findUsed(raw, TokenType.REFRESH_SESSION);

    if (!used) return null;

    if (Date.now() - used.usedAt.getTime() < REFRESH_REUSE_GRACE_MS) {

      if (await this.tokens.hasActiveSince(used.userId, TokenType.REFRESH_SESSION, used.usedAt)) return used.userId;

      throw this.expired(res, false);
    }

    await this.tokens.revokeAll(used.userId, TokenType.REFRESH_SESSION);

    return null;
  }

  async end(req: Request, res: Response) {

    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (raw) await this.tokens.consume(raw, TokenType.REFRESH_SESSION);

    this.clear(res);
  }

  async endAll(res: Response, userId: bigint) {

    await this.tokens.revokeAll(userId, TokenType.REFRESH_SESSION);
    this.clear(res);
  }

  clear(res: Response) {

    res.clearCookie(ACCESS_COOKIE, this.cookie('/'));
    res.clearCookie(REFRESH_COOKIE, this.cookie(REFRESH_COOKIE_PATH));
  }

  private expired(res: Response, clearCookies = true) {

    if (clearCookies) this.clear(res);

    return authError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }

  private cookie(path: string, maxAge?: number): CookieOptions {

    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path, maxAge };
  }
}
