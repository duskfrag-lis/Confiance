import { HttpClient, HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentUserService } from '../services/current-user.service';

const SKIP = ['/auth/refresh', '/auth/login', '/auth/logout'];
const RETRIED = new HttpContextToken(() => false);

let refreshing: Observable<unknown> | null = null;

export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  const user = inject(CurrentUserService);

  if (!req.url.startsWith(environment.apiUrl) || SKIP.some((path) => req.url.endsWith(path))) return next(req);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || req.context.get(RETRIED)) {
        return throwError(() => err);
      }

      refreshing ??= http.post(`${environment.apiUrl}/auth/refresh`, {}).pipe(
        finalize(() => (refreshing = null)),
        shareReplay(1),
      );

      return refreshing.pipe(
        catchError((refreshErr: unknown) => {
          user.clear();
          return throwError(() => refreshErr);
        }),
        switchMap(() => next(req.clone({ context: req.context.set(RETRIED, true) }))),
      );
    }),
  );
};
