import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { chatMockInterceptor } from './core/mock/chat-mock.interceptor';
import { claimsMockInterceptor } from './core/mock/claims-mock.interceptor';
import { contractsMockInterceptor } from './core/mock/contracts-mock.interceptor';
import { notificationsMockInterceptor } from './core/mock/notifications-mock.interceptor';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
import { refreshInterceptor } from './core/interceptors/refresh.interceptor';
import { CurrentUserService } from './core/services/current-user.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
    withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    withViewTransitions(),
    withComponentInputBinding()),
    provideHttpClient(withInterceptors([credentialsInterceptor, refreshInterceptor, notificationsMockInterceptor, claimsMockInterceptor, chatMockInterceptor, contractsMockInterceptor])),
    provideAppInitializer(() => inject(CurrentUserService).load()),
  ],
};
