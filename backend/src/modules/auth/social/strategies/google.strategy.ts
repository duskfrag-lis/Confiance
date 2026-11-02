import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { cookieStateStore, oauthCookieOptions } from '../cookie-state.store';
import type { SocialIdentity } from '../social-identity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {

  constructor(config: ConfigService) {

    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['openid', 'email', 'profile'],
      store: cookieStateStore(oauthCookieOptions(config.get('NODE_ENV') === 'production')),
    });
  }

  /** passport-google-oauth20 ya validó el code contra Google; aquí solo se normaliza el perfil. */
  validate(_accessToken: string, _refreshToken: string, profile: Profile): SocialIdentity {

    const json = profile._json;
    const verified = json.email_verified as unknown;

    return {
      provider: 'google',
      providerUserId: profile.id,
      email: json.email ? json.email.toLowerCase() : null,
      emailVerified: verified === true || verified === 'true',
      firstName: json.given_name ?? '',
      lastName: json.family_name ?? '',
    };
  }
}