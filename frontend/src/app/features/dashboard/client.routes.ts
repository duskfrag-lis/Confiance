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
      {
        path: 'prestadores/:id',
        title: 'Perfil del prestador | Confiance',
        loadComponent: () => import('../profiles/pages/public-profile/public-profile').then((m) => m.PublicProfilePage),
      },
      {
        path: 'buscar',
        title: 'Explorar servicios | Confiance',
        loadComponent: () => import('../search/pages/search-results/search-results').then((m) => m.SearchResults),
      },
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
      {
        path: 'agenda',
        title: 'Agenda | Confiance',
        loadComponent: () => import('../agenda/pages/agenda/agenda').then((m) => m.AgendaPage),
      },
      {
        path: 'mensajes',
        title: 'Mensajes | Confiance',
        loadComponent: () => import('../chat/pages/messages/messages').then((m) => m.MessagesPage),
        children: [
          { path: '', children: [] },
          {
            path: ':id',
            loadComponent: () => import('../chat/pages/conversation/conversation').then((m) => m.ConversationPage),
          },
        ],
      },
      soon('notificaciones', 'Notificaciones'),
      {
        path: 'pagos',
        title: 'Mis pagos | Confiance',
        loadComponent: () => import('../contracting/pages/payments/payments').then((m) => m.PaymentsPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil | Confiance',
        loadComponent: () =>
          import('../profiles/pages/client-profile/client-profile').then((m) => m.ClientProfilePage),
      },
      {
        path: 'solicitar/:prestador',
        title: 'Solicitar servicio | Confiance',
        loadComponent: () =>
          import('../contracting/pages/request-service/request-service').then((m) => m.RequestServicePage),
      },
      soon('reclamos', 'Reclamos'),
      ...ACCOUNT_ROUTES,
    ],
  },
];
