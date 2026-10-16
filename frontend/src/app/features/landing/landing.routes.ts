import { Routes } from '@angular/router';

export const LANDING_ROUTES: Routes = [

    {
        path: '',
        loadComponent: () =>
        import('../../layout/public-layout/public-layout').then((m) => m.PublicLayout),
        children: [

            {
                path: '',
                pathMatch: 'full',
                title: 'Confiance | Contrata oficios cerca de ti, con confianza',
                loadComponent: () => import('./pages/home/home').then((m) => m.Home),
            },
            
            {
                path: 'oficios',
                title: 'Oficios | Confiance',
                loadComponent: () => import('./pages/trades/trades').then((m) => m.Trades),
            },

                        {
                path: 'como-funciona',
                title: 'Cómo funciona | Confiance',
                loadComponent: () => import('./pages/how-it-works/how-it-works').then((m) => m.HowItWorks),
            },

            {
                path: 'seguridad',
                title: 'Seguridad | Confiance',
                loadComponent: () => import('./pages/security/security').then((m) => m.Security),
            },

            {
                path: 'prestadores',
                title: 'Para prestadores | Confiance',
                loadComponent: () => import('./pages/providers/providers').then((m) => m.Providers),
            },

            {
                path: 'terminos',
                title: 'Términos y condiciones | Confiance',
                data: { doc: 'terms' },
                loadComponent: () => import('./pages/legal/legal').then((m) => m.Legal),
            },

            {
                path: 'privacidad',
                title: 'Política de tratamiento de datos | Confiance',
                data: { doc: 'privacy' },
                loadComponent: () => import('./pages/legal/legal').then((m) => m.Legal),
            },

            { path: 'datos-personales', redirectTo: 'privacidad' },

            {
                path: 'buscar',
                title: 'Buscar prestadores | Confiance',
                loadComponent: () =>
                    import('../search/pages/search-results/search-results').then((m) => m.SearchResults),
            },

        ],
    },
];
