import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { authError } from '../auth.constants';
import { SessionService } from '../session.service';
import { oauthCookieOptions } from './cookie-state.store';
import { CompleteSocialDto } from './dto/complete-social.dto';
import { OAuthGuard, type OAuthRequest } from './oauth.guard';
import { PENDING_COOKIE, SocialAuthService, type SocialLoginError } from './social-auth.service';
import type { SocialProvider } from './social-identity';

/**
 * HU-67 / RF-003A / D-29: registro e inicio de sesión con Google o Microsoft.
 * Las rutas siguen el contrato de `features/auth/services/auth.service.ts` del frontend.
 */
@ApiTags('auth')
@Controller('auth')
export class SocialAuthController {

  private readonly logger = new Logger(SocialAuthController.name);
  private readonly cookieOptions: CookieOptions;

  constructor(
    private social: SocialAuthService,
    private session: SessionService,
    private config: ConfigService,
  ) {

    this.cookieOptions = oauthCookieOptions(this.config.get('NODE_ENV') === 'production');
  }

  /** Si el guard redirigió a Google, este método no se ejecuta; si se ejecuta, algo falló. */
  @ApiOperation({ summary: 'HU-67 Redirige a Google' })
  @ApiQuery({ name: 'rol', enum: ['cliente', 'prestador'], required: false })
  @UseGuards(OAuthGuard('google'))
  @Get('google')
  google(@Res() res: Response) {

    this.redirectWithError(res, 'social');
  }

  @ApiOperation({ summary: 'HU-67 Vuelta desde Google (redirige a la SPA)' })
  @UseGuards(OAuthGuard('google'))
  @Get('google/callback')
  googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {

    return this.handleCallback('google', req, res);
  }

  @ApiOperation({ summary: 'HU-67 Redirige a Microsoft' })
  @ApiQuery({ name: 'rol', enum: ['cliente', 'prestador'], required: false })
  @UseGuards(OAuthGuard('microsoft'))
  @Get('microsoft')
  microsoft(@Res() res: Response) {

    this.redirectWithError(res, 'social');
  }

  @ApiOperation({ summary: 'HU-67 Vuelta desde Microsoft (redirige a la SPA)' })
  @UseGuards(OAuthGuard('microsoft'))
  @Get('microsoft/callback')
  microsoftCallback(@Req() req: OAuthRequest, @Res() res: Response) {

    return this.handleCallback('microsoft', req, res);
  }

  @ApiOperation({ summary: 'HU-67 Datos del proveedor para precargar "completar perfil"' })
  @Get('social/pending')
  async pending(@Req() req: Request) {

    const pending = await this.requirePending(req);

    return {
      provider: pending.provider,
      email: pending.email,
      nombres: pending.firstName,
      apellidos: pending.lastName,
    };
  }

  @ApiOperation({ summary: 'HU-67 Crea la cuenta con los datos faltantes y deja la sesión iniciada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('social/complete')
  async complete(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: CompleteSocialDto) {

    const pending = await this.requirePending(req);
    const userId = await this.social.completeSignup(pending, dto);

    res.clearCookie(PENDING_COOKIE, this.cookieOptions);
    await this.session.start(res, userId);
  }

  @ApiOperation({ summary: 'HU-67 Cancela el registro pendiente; no se crea nada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('social/cancel')
  cancel(@Res({ passthrough: true }) res: Response) {

    res.clearCookie(PENDING_COOKIE, this.cookieOptions);
  }

  private async handleCallback(provider: SocialProvider, req: OAuthRequest, res: Response) {

    if (!req.user) return this.redirectWithError(res, 'social');

    try {

      const outcome = await this.social.resolveLogin(req.user);

      if (outcome.kind === 'error') return this.redirectWithError(res, outcome.code);

      if (outcome.kind === 'session') {

        await this.session.start(res, outcome.userId);
        // TODO: cuando exista el panel, redirigir según el perfil activo
        return res.redirect(this.frontendUrl('/'));
      }

      const token = await this.social.signPending(outcome.identity);
      res.cookie(PENDING_COOKIE, token, this.cookieOptions);

      const query = new URLSearchParams({ proveedor: provider });
      if (req.oauthState?.rol) query.set('rol', req.oauthState.rol);

      return res.redirect(this.frontendUrl(`/auth/completar-perfil?${query}`));

    } catch (err) {

      this.logger.error(`Callback de ${provider} falló`, err as Error);
      return this.redirectWithError(res, 'social');
    }
  }

  private async requirePending(req: Request) {

    const pending = await this.social.readPending(req.cookies?.[PENDING_COOKIE]);

    if (!pending) {

      throw authError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'El registro con Google o Microsoft venció. Inténtalo de nuevo.');
    }

    return pending;
  }

  private redirectWithError(res: Response, code: SocialLoginError) {

    res.redirect(this.frontendUrl(`/auth/iniciar-sesion?error=${code}`));
  }

  private frontendUrl(path: string) {

    return new URL(path, this.config.get<string>('FRONTEND_URL')).toString();
  }
}