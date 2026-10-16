import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { STRICT_THROTTLE } from './auth.constants';
import { AuthService } from './auth.service';
import {
  EmailDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterClientDto,
  RegisterProviderDto,
  ResetPasswordDto,
  SwitchProfileDto,
} from './dto/auth.dto';
import { PersonalDataDto } from './dto/personal-data.dto';
import { SessionService } from './session/session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {

  constructor(
    private auth: AuthService,
    private session: SessionService,
    private config: ConfigService,
  ) {}

  @ApiOperation({ summary: 'HU-01 Registro de cliente' })
  @Throttle(STRICT_THROTTLE)
  @Post('register/client')
  registerClient(@Body() dto: RegisterClientDto) {

    return this.auth.registerClient(dto);
  }

  @ApiOperation({ summary: 'HU-02 Registro de prestador' })
  @Throttle(STRICT_THROTTLE)
  @Post('register/provider')
  registerProvider(@Body() dto: RegisterProviderDto) {

    return this.auth.registerProvider(dto);
  }

  @ApiOperation({ summary: 'HU-03 Inicio de sesión (deja las cookies de sesión)' })
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {

    return this.auth.login(dto, res);
  }

  @ApiOperation({ summary: 'Renueva la sesión con la cookie refresh_token' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {

    await this.session.rotate(req, res);
  }

  @ApiOperation({ summary: 'HU-03 Cierre de sesión del dispositivo actual' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {

    await this.session.end(req, res);
  }

  @ApiOperation({ summary: 'Usuario de la sesión actual' })
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {

    return this.auth.me(user.userId);
  }

  @ApiOperation({ summary: 'D-47 Datos personales a revisar tras vincular una cuenta sin correo verificado' })
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @Get('me/personal-data')
  personalData(@CurrentUser() user: AuthUser) {

    return this.auth.personalData(user.userId);
  }

  @ApiOperation({ summary: 'D-47 Confirma o corrige los datos personales y quita la revisión pendiente' })
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @Put('me/personal-data')
  confirmPersonalData(@CurrentUser() user: AuthUser, @Body() dto: PersonalDataDto) {

    return this.auth.confirmPersonalData(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-08 Activar o cambiar el perfil activo (renueva el token de acceso)' })
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('me/profile')
  switchProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {

    return this.auth.switchProfile(user.userId, dto, res);
  }

  @ApiOperation({ summary: 'HU-07 Deshabilitar la propia cuenta' })
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('me/disable')
  async disable(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {

    await this.auth.disableAccount(user.userId, res);
  }

  @ApiOperation({ summary: 'HU-05 Enlace del correo de verificación (redirige a la SPA)' })
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string | undefined, @Res() res: Response) {

    const ok = token ? await this.auth.verifyEmail(token) : false;

    res.redirect(`${this.config.get('FRONTEND_URL')}/auth/iniciar-sesion?correo=${ok ? 'verificado' : 'enlace-invalido'}`);
  }

  @ApiOperation({ summary: 'HU-05 Reenviar el correo de verificación' })
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  async resendVerification(@Body() dto: EmailDto) {

    await this.auth.resendVerification(dto.email);
  }

  @ApiOperation({ summary: 'HU-04 Solicitar recuperación de contraseña' })
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {

    await this.auth.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'HU-04 Restablecer la contraseña con el token del correo' })
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {

    await this.auth.resetPassword(dto);
  }
}
