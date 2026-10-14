/** Usuario de la sesión. Misma forma que devuelve GET /api/auth/me. */
export type ProfileName = 'client' | 'provider';

export interface CurrentUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  emailVerificado: boolean;
  perfilActivo: ProfileName;
  perfiles: { cliente: boolean; prestador: boolean };
  esAdmin: boolean;
  /** Aún no lo devuelve /auth/me (HU-08): clave de la foto en el almacenamiento. */
  fotoUrl?: string | null;
}
