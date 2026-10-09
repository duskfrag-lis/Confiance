import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/types/auth-user';
import { ACCESS_COOKIE } from './auth.constants';
import { AccessTokenPayload } from './session.service';

/** Lee el JWT de la cookie access_token; lo usa JwtAuthGuard (common/guards). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {

  constructor(config: ConfigService) {

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req: Request) => req?.cookies?.[ACCESS_COOKIE] ?? null]),
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {

    return { userId: BigInt(payload.sub), activeProfile: payload.profile, isAdmin: payload.adm };
  }
}
