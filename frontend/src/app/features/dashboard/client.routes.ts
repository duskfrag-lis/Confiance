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
      soon('contrataciones', 'Mis contrataciones'),
      soon('agenda', 'Agenda'),
      soon('mensajes', 'Mensajes'),
      soon('mensajes/:id', 'Mensajes'),
      soon('notificaciones', 'Notificaciones'),
      soon('pagos', 'Mis pagos'),
      soon('perfil', 'Mi perfil'),
      soon('reclamos', 'Reclamos'),
      ...ACCOUNT_ROUTES,
    ],
  },
];
