/** Usuario autenticado que JwtStrategy deja en request.user (ver @CurrentUser). */
export interface AuthUser {
  userId: bigint;
  activeProfile: 'client' | 'provider';
  isAdmin: boolean;
}
