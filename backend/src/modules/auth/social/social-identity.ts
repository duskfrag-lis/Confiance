export type SocialProvider = 'google' | 'microsoft';

/** Rol que llega desde la SPA (`?rol=`); se traduce a `active_profiles` al crear la cuenta. */
export type AccountRole = 'cliente' | 'prestador';

/** Identidad ya validada por el proveedor, normalizada para que el resto no dependa de Google o Microsoft. */
export interface SocialIdentity {
  provider: SocialProvider;
  /** `sub` de Google o `id` de Microsoft Graph: es la clave estable, no el correo. */
  providerUserId: string;
  /** En minúsculas (chk_users_email_lowercase). null si el proveedor no lo entregó. */
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

/** Lo que la ruta de inicio guarda junto al `state` y se recupera en el callback. */
export interface OAuthAppState {
  rol: AccountRole | null;
}

export function parseRole(value: unknown): AccountRole | null {

  return value === 'cliente' || value === 'prestador' ? value : null;
}