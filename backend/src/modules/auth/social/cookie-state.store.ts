import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import type { StateStore } from 'passport-oauth2';
import { REFRESH_COOKIE_PATH } from '../auth.constants';
import type { OAuthAppState } from './social-identity';

export const STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: boolean, state?: OAuthAppState | { message: string }) => void;

/**
 * Opciones de las cookies propias de OAuth (state y registro pendiente).
 * Mismo criterio que SessionService: httpOnly, lax y Secure en producción.
 * lax es obligatorio: la cookie debe viajar en la redirección de vuelta desde Google/Microsoft.
 */
export function oauthCookieOptions(production: boolean): CookieOptions {

  return { httpOnly: true, sameSite: 'lax', secure: production, path: REFRESH_COOKIE_PATH };
}

/**
 * Store de `state` para passport-oauth2 que usa una cookie httpOnly en vez de express-session
 * (el backend no tiene sesiones de servidor). Protege el callback contra CSRF:
 * el `state` que vuelve del proveedor debe ser el mismo que se guardó en la cookie de este navegador.
 */
export class CookieStateStore {

  constructor(private cookieOptions: CookieOptions) {}

  store(req: Request, appState: OAuthAppState | undefined, _meta: unknown, callback: StoreCallback): void {

    const nonce = randomBytes(24).toString('base64url');
    const value = JSON.stringify({ nonce, rol: appState?.rol ?? null });

    req.res!.cookie(STATE_COOKIE, value, { ...this.cookieOptions, maxAge: STATE_TTL_MS });
    callback(null, nonce);
  }

  verify(req: Request, providedState: string | undefined, callback: VerifyCallback): void {

    const saved = this.read(req.cookies?.[STATE_COOKIE]);
    // Un solo uso: se borra pase lo que pase
    req.res!.clearCookie(STATE_COOKIE, this.cookieOptions);

    if (!saved || typeof providedState !== 'string' || !sameString(saved.nonce, providedState)) {

      return callback(null, false, { message: 'Invalid OAuth state' });
    }

    callback(null, true, { rol: saved.rol });
  }

  private read(raw: unknown): { nonce: string; rol: OAuthAppState['rol'] } | null {

    if (typeof raw !== 'string') return null;

    try {

      const parsed = JSON.parse(raw);
      if (typeof parsed?.nonce !== 'string') return null;

      const rol = parsed.rol === 'cliente' || parsed.rol === 'prestador' ? parsed.rol : null;
      return { nonce: parsed.nonce, rol };

    } catch {

      return null;
    }
  }
}

/**
 * Los tipos de passport-oauth2 solo declaran store(req, cb) y store(req, meta, cb),
 * pero en ejecución se llama según la aridad: con 4 parámetros recibe además el estado de la app.
 */
export function cookieStateStore(cookieOptions: CookieOptions): StateStore {

  return new CookieStateStore(cookieOptions) as unknown as StateStore;
}

function sameString(a: string, b: string): boolean {

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}