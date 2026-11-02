import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../../mail/mail.module';
import { AuthTokensService } from './session/auth-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha/captcha.service';
import { JwtStrategy } from './session/jwt.strategy';
import { SessionService } from './session/session.service';
import { SocialAuthController } from './social/social-auth.controller';
import { SocialAuthService } from './social/social-auth.service';
import { GoogleStrategy } from './social/strategies/google.strategy';
import { MicrosoftStrategy } from './social/strategies/microsoft.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController, SocialAuthController],
  providers: [
    AuthService,
    AuthTokensService,
    CaptchaService,
    JwtStrategy,
    SessionService,
    // HU-09: Google y Microsoft
    SocialAuthService,
    GoogleStrategy,
    MicrosoftStrategy,
  ],
  exports: [SessionService],
})
export class AuthModule {}