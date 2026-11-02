import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CurrentUser } from '../models/current-user';
import { CurrentUserService } from '../services/current-user.service';
import { refreshInterceptor } from './refresh.interceptor';

const api = environment.apiUrl;

describe('refreshInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: CurrentUserService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([refreshInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(CurrentUserService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  it('renueva la sesión y reintenta la petición', () => {
    let body: unknown;
    http.get(`${api}/auth/me`).subscribe((b) => (body = b));

    backend.expectOne(`${api}/auth/me`).flush(null, unauthorized);
    backend.expectOne(`${api}/auth/refresh`).flush(null);
    backend.expectOne(`${api}/auth/me`).flush({ ok: true });

    expect(body).toEqual({ ok: true });
  });

  it('si la renovación falla con sesión abierta, lleva al login con aviso y ruta de vuelta', () => {
    session.set({ perfilActivo: 'client' } as CurrentUser);
    http.get(`${api}/contracts`).subscribe({ error: () => undefined });

    backend.expectOne(`${api}/contracts`).flush(null, unauthorized);
    backend.expectOne(`${api}/auth/refresh`).flush(null, unauthorized);

    expect(session.loggedIn()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/iniciar-sesion'], {
      queryParams: { sesion: 'expirada', volver: router.url },
    });
  });

  it('a un visitante sin sesión no lo redirige (p. ej. /auth/me al arrancar)', () => {
    http.get(`${api}/auth/me`).subscribe({ error: () => undefined });

    backend.expectOne(`${api}/auth/me`).flush(null, unauthorized);
    backend.expectOne(`${api}/auth/refresh`).flush(null, unauthorized);

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
