import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../../mail/mail.module';
import { AuthTokensService } from './auth-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { JwtStrategy } from './jwt.strategy';
import { SessionService } from './session.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokensService, CaptchaService, JwtStrategy, SessionService],
  // SessionService queda disponible para el futuro módulo de OAuth
  exports: [SessionService],
})
export class AuthModule {}
