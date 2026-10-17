import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../../common/types/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { ACCESS_COOKIE, AccountStatus } from '../auth.constants';
import { AccessTokenPayload } from './session.service';

/** Lee el JWT de la cookie access_token; lo usa JwtAuthGuard (common/guards). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req: Request) => req?.cookies?.[ACCESS_COOKIE] ?? null]),
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {

    // Tokens emitidos antes de las sesiones por dispositivo no traen `sid`
    if (typeof payload.sid !== 'string' || !/^\d+$/.test(payload.sid)) throw new UnauthorizedException();

    const userId = BigInt(payload.sub);
    const sessionId = BigInt(payload.sid);

    // HU-06/HU-07: una cuenta deshabilitada pierde el acceso de inmediato, y una sesión cerrada
    // (cierre de sesión, token robado, contraseña restablecida, D-47) también, sin esperar a que venza el token
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: {
        account_statuses: { select: { status_name: true } },
        user_sessions: { where: { session_id: sessionId }, select: { revoked_at: true, expires_at: true } },
      },
    });

    if (!user || user.account_statuses.status_name === AccountStatus.DISABLED) throw new UnauthorizedException();

    const session = user.user_sessions[0];

    if (!session || session.revoked_at || session.expires_at <= new Date()) throw new UnauthorizedException();

    return { userId, sessionId, activeProfile: payload.profile, isAdmin: payload.adm };
  }
}
