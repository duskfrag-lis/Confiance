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

    const userId = BigInt(payload.sub);

    // HU-07: una cuenta deshabilitada pierde el acceso de inmediato, sin esperar a que venza el token
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { account_statuses: { select: { status_name: true } } },
    });

    if (!user || user.account_statuses.status_name === AccountStatus.DISABLED) throw new UnauthorizedException();

    return { userId, activeProfile: payload.profile, isAdmin: payload.adm };
  }
}
