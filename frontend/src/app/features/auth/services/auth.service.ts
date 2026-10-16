import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, apiErrorCode, unwrap } from '../../../core/api/api';
import { CurrentUser, ProfileName } from '../../../core/models/current-user';
import { CurrentUserService } from '../../../core/services/current-user.service';
import {
  AccountRole,
  CompleteSocialPayload,
  LoginError,
  LoginErrorCode,
  LoginPayload,
  RegisterClientPayload,
  RegisterError,
  RegisterErrorCode,
  RegisterProviderPayload,
  RegisterResponse,
  SocialPending,
  SocialProvider,
  Trade,
} from '../models/auth.models';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

const api = environment.apiUrl;

const REGISTER_CODES: RegisterErrorCode[] = ['EMAIL_TAKEN', 'CEDULA_TAKEN', 'NIT_TAKEN', 'INVALID_CATEGORY', 'CAPTCHA_FAILED'];
const LOGIN_CODES: LoginErrorCode[] = ['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'CAPTCHA_FAILED'];

const asRegisterError = (err: unknown) => {
  const code = apiErrorCode(err) as RegisterErrorCode | null;
  return new RegisterError(code && REGISTER_CODES.includes(code) ? code : 'UNKNOWN');
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(CurrentUserService);

  registerClient(payload: RegisterClientPayload): Observable<RegisterResponse> {
    return this.http
      .post<ApiResponse<RegisterResponse>>(`${api}/auth/register/client`, payload)
      .pipe(unwrap(), catchError((err) => throwError(() => asRegisterError(err))));
  }

  registerProvider(payload: RegisterProviderPayload): Observable<RegisterResponse> {
    return this.http
      .post<ApiResponse<RegisterResponse>>(`${api}/auth/register/provider`, payload)
      .pipe(unwrap(), catchError((err) => throwError(() => asRegisterError(err))));
  }

  getTrades(): Observable<Trade[]> {
    return this.http.get<ApiResponse<Category[]>>(`${api}/categories`).pipe(
      unwrap(),
      map((categories) => {
        const groups = new Map(categories.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
        return categories
          .filter((c) => c.parentId && groups.has(c.parentId))
          .map((c) => ({ id: c.id, name: c.name, group: groups.get(c.parentId!)! }));
      }),
      catchError(() => of([])),
    );
  }

  login(payload: LoginPayload): Observable<CurrentUser> {
    return this.http.post<ApiResponse<CurrentUser>>(`${api}/auth/login`, payload).pipe(
      unwrap(),
      tap((user) => this.session.set(user)),
      catchError((err) => {
        const code = apiErrorCode(err) as LoginErrorCode | null;
        return throwError(() => new LoginError(code && LOGIN_CODES.includes(code) ? code : 'UNKNOWN'));
      }),
    );
  }

  requestPasswordReset(email: string, captchaToken: string): Observable<void> {
    return this.http.post<void>(`${api}/auth/forgot-password`, { email, captchaToken });
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${api}/auth/reset-password`, { token, password });
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post<void>(`${api}/auth/resend-verification`, { email });
  }

  switchProfile(perfil: ProfileName, extra: { oficios?: string[]; nit?: string | null } = {}): Observable<CurrentUser> {
    return this.http
      .post<ApiResponse<CurrentUser>>(`${api}/auth/me/profile`, { perfil, ...extra })
      .pipe(unwrap(), tap((user) => this.session.set(user)));
  }

  disableAccount(): Observable<void> {
    return this.http.post<void>(`${api}/auth/me/disable`, {}).pipe(tap(() => this.session.clear()));
  }

  socialLoginUrl(provider: SocialProvider, rol: AccountRole | null): string {
    const query = rol ? `?rol=${rol}` : '';
    return `${api}/auth/${provider}${query}`;
  }

  getPendingSocial(mockProvider?: string | null): Observable<SocialPending> {
    if (environment.mockSocialAuth) {
      const provider: SocialProvider = mockProvider === 'microsoft' ? 'microsoft' : 'google';
      return timer(400).pipe(
        map(() => ({ provider, email: 'laura.gomez@gmail.com', nombres: 'Laura Marcela', apellidos: 'Gómez Ríos' })),
      );
    }
    return this.http.get<ApiResponse<SocialPending>>(`${api}/auth/social/pending`).pipe(unwrap());
  }

  completeSocialProfile(payload: CompleteSocialPayload): Observable<void> {
    if (environment.mockSocialAuth) {
      return timer(900).pipe(
        map(() => {
          if (payload.cedula === '1000000000') throw new RegisterError('CEDULA_TAKEN');
        }),
      );
    }
    return this.http.post<void>(`${api}/auth/social/complete`, payload).pipe(
      catchError((err) => throwError(() => asRegisterError(err))),
      switchMap(() => this.session.load()),
    );
  }

  cancelSocialSignup(): Observable<void> {
    return environment.mockSocialAuth ? of(undefined) : this.http.post<void>(`${api}/auth/social/cancel`, {});
  }
}
