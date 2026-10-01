import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'registro',
    title: 'Crear cuenta | Confiance',
    loadComponent: () =>
      import('./pages/register-client/register-client').then((m) => m.RegisterClient),
  },

  {
    path: 'registro-prestador',
    title: 'Crear perfil de prestador | Confiance',
    loadComponent: () =>
      import('./pages/register-provider/register-provider').then((m) => m.RegisterProvider),
  },

  {
    path: 'iniciar-sesion',
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

  { path: '', pathMatch: 'full', redirectTo: 'registro' },
];
