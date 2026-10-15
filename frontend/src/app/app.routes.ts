import { Routes } from '@angular/router';

export const routes: Routes = [

  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: 'prestador',
    loadChildren: () => import('./features/dashboard/provider.routes').then((m) => m.PROVIDER_ROUTES),
  },

  { 
    path: '', 
    loadChildren: () => import('./features/landing/landing.routes').then((m) => m.LANDING_ROUTES), 
  },

  { 
    path: '**', redirectTo: '' 
  },

];
