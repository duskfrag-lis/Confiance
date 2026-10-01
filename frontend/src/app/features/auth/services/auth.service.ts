import { Injectable } from '@angular/core';
// import { HttpClient } from '@angular/common/http';
// import { environment } from '../../../../environments/environment';
import { Observable, of, switchMap, throwError, timer } from 'rxjs';
import {
  RegisterClientPayload,
  RegisterError,
  RegisterProviderPayload,
  RegisterResponse,
  LoginError,
  LoginPayload,
  Trade,
} from '../models/auth.models';

const TRADES: Trade[] = [
  'Albañilería',
  'Carpintería',
  'Pintura',
  'Enchape y pisos',
  'Impermeabilización',
  'Soldadura',
  'Fontanería',
  'Electricidad',
  'Gasodomésticos',
  'Aire acondicionado',
  'Reparaciones generales',
  'Cerrajería',
  'Electrodomésticos',
  'Vidriería',
  'Aseo',
  'Fumigación',
  'Jardinería',
  'Mudanzas',
].map((name) => ({
  id: name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-'),
  name,
}));

@Injectable({ providedIn: 'root' })
export class AuthService {
  // private readonly http = inject(HttpClient);

  registerClient(payload: RegisterClientPayload): Observable<RegisterResponse> {
    // TODO: return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register/client`, payload);
    return this.simulateRegister(payload);
  }

  registerProvider(payload: RegisterProviderPayload): Observable<RegisterResponse> {
    // TODO: return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register/provider`, payload);
    return this.simulateRegister(payload);
  }

  getTrades(): Observable<Trade[]> {
    // TODO: return this.http.get<Trade[]>(`${environment.apiUrl}/categories`);
    return of(TRADES);
  }

  requestPasswordReset(email: string): Observable<void> {
    // TODO: return this.http.post<void>(`${environment.apiUrl}/auth/forgot-password`, { email });
    // Simulación: 'error@correo.com' devuelve error para probar ese estado.
    return timer(900).pipe(
      switchMap(() =>
        email === 'error@correo.com' ? throwError(() => new Error('SERVER')) : of(undefined),
      ),
    );
  }

  resendVerification(email: string): Observable<void> {
    // TODO: return this.http.post<void>(`${environment.apiUrl}/auth/resend-verification`, { email });
    return timer(900).pipe(switchMap(() => of(undefined)));
  }

  login(payload: LoginPayload): Observable<void> {
    // TODO: return this.http.post<void>(`${environment.apiUrl}/auth/login`, payload);
    // (el credentials.interceptor ya se encarga de enviar/recibir la cookie)
    //
    // Simulación:
    //  - deshabilitada@correo.com -> cuenta deshabilitada
    //  - contraseña "Prueba123!"  -> entra bien
    //  - cualquier otra cosa      -> credenciales incorrectas
    return timer(900).pipe(
      switchMap(() => {
        if (payload.email === 'deshabilitada@correo.com')
          return throwError(() => new LoginError('ACCOUNT_DISABLED'));
        if (payload.password !== 'Prueba123!')
          return throwError(() => new LoginError('INVALID_CREDENTIALS'));
        return of(undefined);
      }),
    );
  }

  /**
   * Simulación: siempre responde OK, salvo:
   *  - existente@correo.com  -> correo ya registrado
   *  - cédula 1000000000     -> cédula ya registrada
   *  para comprobar cómo se ven esos errores
   */

  private simulateRegister(p: { email: string; cedula: string }): Observable<RegisterResponse> {
    return timer(900).pipe(
      switchMap(() => {
        if (p.email === 'existente@correo.com')
          return throwError(() => new RegisterError('EMAIL_TAKEN'));
        if (p.cedula === '1000000000') return throwError(() => new RegisterError('CEDULA_TAKEN'));
        return of({ email: p.email });
      }),
    );
  }
}
