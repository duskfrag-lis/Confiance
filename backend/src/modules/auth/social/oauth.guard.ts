import { ExecutionContext, Injectable, Logger, mixin, Type, CanActivate } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { OAuthAppState, parseRole, SocialIdentity, SocialProvider } from './social-identity';

/** Lo que el guard deja en la petición del callback para el controlador. */
export type OAuthRequest = Omit<Request, 'user'> & {
  /** null si el proveedor o el `state` fallaron (el usuario canceló, state inválido, etc.). */
  user?: SocialIdentity | null;
  oauthState?: OAuthAppState;
};

/**
 * Guard de Passport para un proveedor OAuth.
 * - En la ruta de inicio redirige al proveedor, guardando el `rol` preseleccionado junto al state.
 * - En el callback nunca lanza: deja `req.user = null` para que el controlador
 *   redirija a la SPA con un error en vez de mostrar un JSON en el navegador.
 */
export function OAuthGuard(provider: SocialProvider): Type<CanActivate> {

  @Injectable()
  class Guard extends AuthGuard(provider) {

    private readonly logger = new Logger(`OAuthGuard:${provider}`);

    async canActivate(context: ExecutionContext): Promise<boolean> {

      try {

        return (await super.canActivate(context)) as boolean;

      } catch (err) {

        this.logger.warn(`Fallo en el inicio de sesión con ${provider}: ${(err as Error)?.message}`);
        context.switchToHttp().getRequest<OAuthRequest>().user = null;
        return true;
      }
    }

    getAuthenticateOptions(context: ExecutionContext) {

      const req = context.switchToHttp().getRequest<Request>();

      // Un objeto (no un string) hace que passport-oauth2 lo pase al CookieStateStore;
      // los tipos de passport solo admiten string, de ahí el cast
      const state: OAuthAppState = { rol: parseRole(req.query.rol) };

      return { session: false, state: state as unknown as string };
    }

    handleRequest<T>(err: unknown, user: T, info: unknown, context: ExecutionContext): T {

      if (err) throw err;

      // Passport rechaza sin error (state inválido, usuario que cancela…): el motivo viene en info
      // o, si el usuario canceló, en ?error= del proveedor
      if (!user) {

        const reason =
          (info as { message?: string } | undefined)?.message ??
          context.switchToHttp().getRequest<Request>().query.error ??
          'sin motivo';

        throw new Error(`OAuth sin usuario: ${String(reason)}`);
      }

      const state = (info as { state?: OAuthAppState } | undefined)?.state;
      context.switchToHttp().getRequest<OAuthRequest>().oauthState = state ?? { rol: null };

      return user;
    }
  }

  return mixin(Guard);
}