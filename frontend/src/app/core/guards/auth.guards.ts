import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileName } from '../models/current-user';
import { CurrentUserService } from '../services/current-user.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const user = inject(CurrentUserService);
  return user.loggedIn() || inject(Router).createUrlTree(['/auth/iniciar-sesion'], { queryParams: { volver: state.url } });
};

export const profileGuard =
  (profile: ProfileName): CanActivateFn =>
  () => {
    const user = inject(CurrentUserService);
    return user.current()?.perfilActivo === profile || inject(Router).parseUrl(user.home());
  };

export const guestGuard: CanActivateFn = () => {
  const user = inject(CurrentUserService);
  return !user.loggedIn() || inject(Router).parseUrl(user.home());
};
