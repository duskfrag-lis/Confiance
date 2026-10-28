import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { AuthUser } from '../../common/types/auth-user';
import { ACCESS_COOKIE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/session/jwt.strategy';
import type { AccessTokenPayload } from '../auth/session/session.service';

/** Valor de una cookie dentro de la cabecera Cookie ("a=1; access_token=xyz"). */
export const readCookie = (header: string | undefined, name: string) => {

  const pair = header?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
};

/**
 * El socket no pasa por JwtAuthGuard: se autentica con la misma cookie access_token y las mismas reglas que la
 * API (JwtStrategy.validate: cuenta habilitada y sesión abierta).
 */
@Injectable()
export class SocketAuthService {

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private strategy: JwtStrategy,
  ) {}

  async authenticate(client: Socket): Promise<AuthUser> {

    const token = readCookie(client.handshake.headers.cookie, ACCESS_COOKIE);

    if (!token) throw new UnauthorizedException();

    const payload = await this.jwt
      .verifyAsync<AccessTokenPayload>(token, { secret: this.config.get<string>('JWT_ACCESS_SECRET') })
      .catch(() => { throw new UnauthorizedException(); });

    return this.strategy.validate(payload);
  }
}
