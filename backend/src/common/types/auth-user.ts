/**Nombre de "active_Profile" (seed de catalogo) */
export type ProfileName = 'client' | 'provider';

/** Usuario autenticado que JwtStrategy deja en request.user (ver @CurrentUser). */
export interface AuthUser {
  userId: bigint;
  activeProfile: ProfileName;
  isAdmin: boolean;
}
