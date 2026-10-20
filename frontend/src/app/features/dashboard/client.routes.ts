import { Routes } from '@angular/router';
import { authGuard, profileGuard } from '../../core/guards/auth.guards';
import { ACCOUNT_ROUTES, soon } from './shared.routes';

export const CLIENT_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, profileGuard('client')],
    loadComponent: () =>
      import('../../layout/private-layout/private-layout').then((m) => m.PrivateLayout),
    children: [
      { ...soon('', 'Inicio'), pathMatch: 'full' },
      soon('buscar', 'Buscar servicios'),
      {
        path: 'necesidades',
        title: 'Mis necesidades | Confiance',
        loadComponent: () => import('../publications/pages/my-needs/my-needs').then((m) => m.MyNeedsPage),
      },
      {
        path: 'necesidades/nueva',
        title: 'Publicar necesidad | Confiance',
        loadComponent: () => import('../publications/pages/need-form/need-form').then((m) => m.NeedFormPage),
      },
      {
        path: 'necesidades/:id',
        title: 'Necesidad | Confiance',
        loadComponent: () => import('../publications/pages/need-detail/need-detail').then((m) => m.NeedDetailPage),
      },
      {
        path: 'contrataciones',
        title: 'Mis contrataciones | Confiance',
        loadComponent: () =>
          import('../contracting/pages/client-contracts-list/client-contracts-list').then((m) => m.ClientContractsList),
      },
      {
        path: 'contrataciones/:id',
        title: 'Contratación | Confiance',
        loadComponent: () =>
          import('../contracting/pages/client-contract-detail/client-contract-detail').then((m) => m.ClientContractDetail),
      },
      soon('agenda', 'Agenda'),
      soon('mensajes', 'Mensajes'),
      soon('mensajes/:id', 'Mensajes'),
      soon('notificaciones', 'Notificaciones'),
      soon('pagos', 'Mis pagos'),
      {
        path: 'perfil',
        title: 'Mi perfil | Confiance',
        loadComponent: () =>
          import('../profiles/pages/client-profile/client-profile').then((m) => m.ClientProfilePage),
      },
      soon('solicitar/:prestador', 'Solicitar servicio'),
      soon('reclamos', 'Reclamos'),
      ...ACCOUNT_ROUTES,
    ],
  },
];
