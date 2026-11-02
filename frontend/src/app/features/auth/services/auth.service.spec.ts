import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService.socialLoginUrl', () => {
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    auth = TestBed.inject(AuthService);
  });

  it('sin opciones va directo al proveedor', () => {
    expect(auth.socialLoginUrl('google')).toBe(`${environment.apiUrl}/auth/google`);
  });

  it('lleva rol, recordar y la ruta de vuelta codificada', () => {
    expect(auth.socialLoginUrl('microsoft', { rol: 'prestador', recordar: true, volver: '/prestador/agenda?dia=2' })).toBe(
      `${environment.apiUrl}/auth/microsoft?rol=prestador&recordar=1&volver=%2Fprestador%2Fagenda%3Fdia%3D2`,
    );
  });

  it('omite recordar cuando no se marcó', () => {
    expect(auth.socialLoginUrl('google', { recordar: false })).toBe(`${environment.apiUrl}/auth/google`);
  });
});
