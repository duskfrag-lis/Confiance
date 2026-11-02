import { Route } from '@angular/router';

export const soon = (path: string, title: string): Route => ({
  path,
  title: `${title} | Confiance`,
  data: { title },
  loadComponent: () => import('./pages/coming-soon/coming-soon').then((m) => m.ComingSoon),
});

export const ACCOUNT_ROUTES: Route[] = [
  {
    path: 'cambiar-perfil',
    title: 'Cambiar de perfil | Confiance',
    loadComponent: () =>
      import('../profiles/pages/switch-profile/switch-profile').then((m) => m.SwitchProfile),
  },
  {
    path: 'configuracion',
    title: 'Configuración | Confiance',
    loadComponent: () => import('../profiles/pages/settings/settings').then((m) => m.Settings),
  },
];
