import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { CurrentUser } from '../models/current-user';
import { CurrentUserService } from '../services/current-user.service';
import { authGuard, reviewGuard } from './auth.guards';

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: '7',
  email: 'laura@gmail.com',
  nombres: 'Laura',
  apellidos: 'Gómez',
  emailVerificado: true,
  perfilActivo: 'client',
  perfiles: { cliente: true, prestador: false },
  esAdmin: false,
  revisarPerfil: false,
  ...overrides,
});

describe('auth guards', () => {
  let session: CurrentUserService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    session = TestBed.inject(CurrentUserService);
    router = TestBed.inject(Router);
  });

  const run = (guard: typeof authGuard, url = '/cliente/contrataciones') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  const asUrl = (result: unknown) => router.serializeUrl(result as UrlTree);

  describe('authGuard', () => {
    it('sin sesión lleva al login recordando a dónde iba', () => {
      expect(asUrl(run(authGuard))).toBe('/auth/iniciar-sesion?volver=%2Fcliente%2Fcontrataciones');
    });

    it('con la revisión de datos pendiente obliga a pasar por ella (D-47)', () => {
      session.set(user({ revisarPerfil: true }));
      expect(asUrl(run(authGuard))).toBe('/auth/revisar-perfil');
    });

    it('deja pasar una sesión normal', () => {
      session.set(user());
      expect(run(authGuard)).toBe(true);
    });
  });

  describe('reviewGuard', () => {
    it('deja entrar solo con la revisión pendiente', () => {
      session.set(user({ revisarPerfil: true }));
      expect(run(reviewGuard)).toBe(true);
    });

    it('sin revisión pendiente manda al inicio del perfil', () => {
      session.set(user({ perfilActivo: 'provider' }));
      expect(asUrl(run(reviewGuard))).toBe('/prestador');
    });
  });
});
