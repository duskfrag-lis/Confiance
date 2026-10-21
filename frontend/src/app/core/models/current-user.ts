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
  /** D-47: debe confirmar sus datos personales antes de usar la plataforma (/auth/revisar-perfil) */
  revisarPerfil: boolean;
  /** URL pública de la foto de perfil (HU-11), o null si no tiene. */
  fotoUrl?: string | null;
}
