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
      {
        path: 'servicios',
        title: 'Mis servicios | Confiance',
        loadComponent: () => import('../publications/pages/my-listings/my-listings').then((m) => m.MyListingsPage),
      },
      {
        path: 'servicios/nuevo',
        title: 'Publicar servicio | Confiance',
        loadComponent: () => import('../publications/pages/listing-form/listing-form').then((m) => m.ListingFormPage),
      },
      {
        path: 'servicios/:id',
        title: 'Editar servicio | Confiance',
        loadComponent: () => import('../publications/pages/listing-form/listing-form').then((m) => m.ListingFormPage),
      },
      soon('necesidades', 'Necesidades'),
      soon('agenda', 'Agenda'),
      soon('mensajes', 'Mensajes'),
      soon('mensajes/:id', 'Mensajes'),
      soon('reclamos', 'Reclamos'),
      soon('pagos', 'Pagos recibidos'),
      soon('notificaciones', 'Notificaciones'),
      {
        path: 'perfil',
        title: 'Perfil profesional | Confiance',
        loadComponent: () =>
          import('../profiles/pages/provider-profile/provider-profile').then((m) => m.ProviderProfilePage),
      },
      {
        path: 'trabajos',
        title: 'Trabajos realizados | Confiance',
        loadComponent: () => import('../profiles/pages/evidences/evidences').then((m) => m.EvidencesPage),
      },
      soon('verificacion', 'Verificación'),
      {
        path: 'informacion-bancaria',
        title: 'Información bancaria | Confiance',
        loadComponent: () => import('../profiles/pages/bank-account/bank-account').then((m) => m.BankAccountPage),
      },
      ...ACCOUNT_ROUTES,
    ],
  },
];
