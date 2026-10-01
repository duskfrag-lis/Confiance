import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  //temporal: cuando exista la landing, '' apunta a ella
  { path: '', pathMatch: 'full', redirectTo: 'auth/registro' },
  { path: '**', redirectTo: 'auth/registro' },
];
