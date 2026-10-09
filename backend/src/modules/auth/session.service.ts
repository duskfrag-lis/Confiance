import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CookieOptions, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthTokensService } from './auth-tokens.service';
import {
  ACCESS_COOKIE,
  AccountStatus,
  authError,
  ProfileName,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  TokenType,
} from './auth.constants';

export interface AccessTokenPayload {
  sub: string;
  profile: ProfileName;
  adm: boolean;
}

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Convierte duraciones como "15m" o "7d" (las de JWT_*_EXPIRES) a milisegundos. */
export function parseDuration(value: string) {

  const match = /^(\d+)([smhd])$/.exec(value.trim());

  if (!match) throw new Error(`Duración inválida: ${value}`);

  return Number(match[1]) * UNITS[match[2]];
}

/**
 * Sesión basada en dos cookies httpOnly:
 * - access_token: JWT corto (JWT_ACCESS_EXPIRES) que lee la JwtStrategy.
 * - refresh_token: token opaco (JWT_REFRESH_EXPIRES) guardado como hash en auth_tokens; se rota en
 *   cada uso, y cerrar sesión lo invalida (HU-03). Queda listo para reutilizarse en OAuth.
 */
@Injectable()
export class SessionService {

  private accessMs: number;
  private refreshMs: number;
  private secure: boolean;

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private prisma: PrismaService,
    private tokens: AuthTokensService,
  ) {

    this.accessMs = parseDuration(this.config.get<string>('JWT_ACCESS_EXPIRES')!);
    this.refreshMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES')!);
    this.secure = this.config.get('NODE_ENV') === 'production';
  }

  async start(res: Response, userId: bigint) {

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
    const refresh = await this.tokens.issue(user.user_id, TokenType.REFRESH_SESSION, this.refreshMs);

    res.cookie(ACCESS_COOKIE, access, this.cookie('/', this.accessMs));
    res.cookie(REFRESH_COOKIE, refresh, this.cookie(REFRESH_COOKIE_PATH, this.refreshMs));
  }

  async rotate(req: Request, res: Response) {

    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (!raw) throw this.expired(res);

    const userId = await this.tokens.consume(raw, TokenType.REFRESH_SESSION);

    if (userId === null) {

      // Un refresh token ya usado que vuelve a aparecer indica que pudo ser robado
      const reusedBy = await this.tokens.wasUsed(raw, TokenType.REFRESH_SESSION);

      if (reusedBy !== null) await this.tokens.revokeAll(reusedBy, TokenType.REFRESH_SESSION);

      throw this.expired(res);
    }

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: { account_statuses: true },
    });

    if (user.account_statuses.status_name === AccountStatus.DISABLED) throw this.expired(res);

    await this.start(res, userId);
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

  private expired(res: Response) {

    this.clear(res);

    return authError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }

  private cookie(path: string, maxAge?: number): CookieOptions {

    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path, maxAge };
  }
}
