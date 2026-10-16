import { Routes } from '@angular/router';
import { authGuard, profileGuard } from '../../core/guards/auth.guards';
import { ACCOUNT_ROUTES, soon } from './shared.routes';

export const PROVIDER_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, profileGuard('provider')],
    loadComponent: () =>
      import('../../layout/private-layout/private-layout').then((m) => m.PrivateLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Inicio | Confiance',
        loadComponent: () => import('./pages/provider-home/provider-home').then((m) => m.ProviderHome),
      },
      {
        path: 'contrataciones',
        title: 'Mis contrataciones | Confiance',
        loadComponent: () =>
          import('../contracting/pages/contracts-list/contracts-list').then((m) => m.ContractsList),
      },
      {
        path: 'contrataciones/:id',
        title: 'Contratación | Confiance',
        loadComponent: () =>
          import('../contracting/pages/contract-detail/contract-detail').then((m) => m.ContractDetail),
      },
      soon('servicios', 'Mis servicios'),
      soon('necesidades', 'Necesidades'),
      soon('agenda', 'Agenda'),
      soon('mensajes', 'Mensajes'),
      soon('mensajes/:id', 'Mensajes'),
      soon('reclamos', 'Reclamos'),
      soon('pagos', 'Pagos recibidos'),
      soon('notificaciones', 'Notificaciones'),
      soon('perfil', 'Perfil profesional'),
      soon('trabajos', 'Trabajos realizados'),
      soon('verificacion', 'Verificación'),
      soon('informacion-bancaria', 'Información bancaria'),
      ...ACCOUNT_ROUTES,
    ],
  },
];
