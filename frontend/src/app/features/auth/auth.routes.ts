import { Routes } from '@angular/router';
import { guestGuard } from '../../core/guards/auth.guards';

export const AUTH_ROUTES: Routes = [
  {
    path: 'registro',
    canActivate: [guestGuard],
    title: 'Crear cuenta | Confiance',
    loadComponent: () =>
      import('./pages/register-client/register-client').then((m) => m.RegisterClient),
  },

  {
    path: 'registro-prestador',
    canActivate: [guestGuard],
    title: 'Crear perfil de prestador | Confiance',
    loadComponent: () =>
      import('./pages/register-provider/register-provider').then((m) => m.RegisterProvider),
  },

  {
    path: 'iniciar-sesion',
    canActivate: [guestGuard],
    title: 'Iniciar sesión | Confiance',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },

  {
    path: 'recuperar-contrasena',
    title: 'Recuperar contraseña | Confiance',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },

  {
    path: 'restablecer-contrasena',
    title: 'Nueva contraseña | Confiance',
    loadComponent: () =>
      import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
  },

  {
    path: 'revisar-correo',
    loadComponent: () =>
      import('../../layout/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        title: 'Revisa tu correo | Confiance',
        loadComponent: () => import('./pages/check-email/check-email').then((m) => m.CheckEmail),
      },
    ],
  },

  {
    path: 'completar-perfil',
    canActivate: [guestGuard],
    title: 'Completa tu perfil | Confiance',
    loadComponent: () =>
      import('./pages/complete-profile/complete-profile').then((m) => m.CompleteProfile),
  },

  { path: '', pathMatch: 'full', redirectTo: 'registro' },
];
