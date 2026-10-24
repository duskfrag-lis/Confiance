import { Routes } from '@angular/router';
import { adminGuard, authGuard } from '../../core/guards/auth.guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('../../layout/private-layout/private-layout').then((m) => m.PrivateLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Administración | Confiance',
        loadComponent: () => import('./pages/admin-home/admin-home').then((m) => m.AdminHomePage),
      },
      {
        path: 'reclamos',
        title: 'Reclamos · Administración | Confiance',
        loadComponent: () => import('./pages/admin-claims/admin-claims').then((m) => m.AdminClaimsPage),
      },
      {
        path: 'reclamos/:id',
        title: 'Reclamo · Administración | Confiance',
        loadComponent: () => import('./pages/admin-claim-detail/admin-claim-detail').then((m) => m.AdminClaimDetailPage),
      },
      {
        path: 'verificaciones',
        title: 'Verificaciones · Administración | Confiance',
        loadComponent: () => import('./pages/admin-verifications/admin-verifications').then((m) => m.AdminVerificationsPage),
      },
      {
        path: 'fuerza-mayor',
        title: 'Fuerza mayor · Administración | Confiance',
        loadComponent: () => import('./pages/admin-force-majeure/admin-force-majeure').then((m) => m.AdminForceMajeurePage),
      },
    ],
  },
];
