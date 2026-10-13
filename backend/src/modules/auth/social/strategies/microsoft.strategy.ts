import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { cookieStateStore, oauthCookieOptions } from '../cookie-state.store';
import type { SocialIdentity } from '../social-identity';

/** Campos de Microsoft Graph `/me` que usa la estrategia. */
interface GraphMe {
  id: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  givenName?: string | null;
  surname?: string | null;
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {

  constructor(config: ConfigService) {

    super({
      clientID: config.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('MICROSOFT_CALLBACK_URL'),
      tenant: config.get<string>('MICROSOFT_TENANT') ?? 'common',
      scope: ['openid', 'email', 'profile', 'User.Read'],
      store: cookieStateStore(oauthCookieOptions(config.get('NODE_ENV') === 'production')),
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: { _json: GraphMe }): SocialIdentity {

    const me = profile._json;
    // Las cuentas personales suelen traer `mail` vacío y el correo en `userPrincipalName`
    const email = [me.mail, me.userPrincipalName].find((v) => typeof v === 'string' && v.includes('@'));

    return {
      provider: 'microsoft',
      providerUserId: me.id,
      email: email ? email.toLowerCase() : null,
      // Graph no expone un indicador de verificación; se acepta según HU-05 (ver V-2 en la orientación)
      emailVerified: Boolean(email),
      firstName: me.givenName ?? '',
      lastName: me.surname ?? '',
    };
  }
}