import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileName } from '../models/current-user';
import { CurrentUserService } from '../services/current-user.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const user = inject(CurrentUserService);
  const router = inject(Router);
  if (!user.loggedIn()) return router.createUrlTree(['/auth/iniciar-sesion'], { queryParams: { volver: state.url } });
  // D-47: la revisión de datos tras vincular la cuenta es obligatoria antes de cualquier página privada
  return !user.current()!.revisarPerfil || router.createUrlTree(['/auth/revisar-perfil']);
};

/** Solo entra quien tiene la revisión de datos pendiente. */
export const reviewGuard: CanActivateFn = () => {
  const user = inject(CurrentUserService);
  if (!user.loggedIn()) return inject(Router).parseUrl('/auth/iniciar-sesion');
  return user.current()!.revisarPerfil || inject(Router).parseUrl(user.home());
};

export const profileGuard =
  (profile: ProfileName): CanActivateFn =>
  () => {
    const user = inject(CurrentUserService);
    return user.current()?.perfilActivo === profile || inject(Router).parseUrl(user.home());
  };

/** Solo el administrador (users.is_admin, D-11). */
export const adminGuard: CanActivateFn = () => {
  const user = inject(CurrentUserService);
  return !!user.current()?.esAdmin || inject(Router).parseUrl(user.home());
};

export const guestGuard: CanActivateFn = () => {
  const user = inject(CurrentUserService);
  return !user.loggedIn() || inject(Router).parseUrl(user.home());
};
