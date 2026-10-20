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
      soon('necesidades', 'Mis necesidades'),
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
