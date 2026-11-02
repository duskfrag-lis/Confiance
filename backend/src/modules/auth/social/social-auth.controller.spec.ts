import { SessionService } from '../session/session.service';
import { SocialAuthController } from './social-auth.controller';
import type { OAuthRequest } from './oauth.guard';
import { SocialAuthService } from './social-auth.service';
import type { OAuthAppState, SocialIdentity } from './social-identity';

describe('SocialAuthController', () => {
  it('aplica el límite estricto de intentos a las rutas de OAuth', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', SocialAuthController)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', SocialAuthController)).toBe(60_000);
  });

  describe('callback', () => {
    let social: { resolveLogin: jest.Mock; signPending: jest.Mock };
    let session: { start: jest.Mock };
    let controller: SocialAuthController;
    let res: { redirect: jest.Mock; cookie: jest.Mock };

    const identity = { provider: 'google', providerUserId: 'sub-1' } as SocialIdentity;
    const callback = (state: Partial<OAuthAppState> = {}) =>
      controller.googleCallback(
        { user: identity, oauthState: { rol: null, recordar: false, volver: null, ...state } } as OAuthRequest,
        res as any,
      );

    beforeEach(() => {
      social = { resolveLogin: jest.fn(), signPending: jest.fn().mockResolvedValue('pendiente') };
      session = { start: jest.fn().mockResolvedValue('provider') };
      res = { redirect: jest.fn(), cookie: jest.fn() };
      const config = { get: (k: string) => (k === 'FRONTEND_URL' ? 'http://localhost:4200' : undefined) };

      controller = new SocialAuthController(
        social as unknown as SocialAuthService,
        session as unknown as SessionService,
        config as any,
      );
    });

    it('con una cuenta existente lleva al inicio de su perfil activo', async () => {
      social.resolveLogin.mockResolvedValue({ kind: 'session', userId: 7n });

      await callback({ recordar: true });

      expect(session.start).toHaveBeenCalledWith(res, 7n, true);
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4200/prestador');
    });

    it('vuelve a la ruta pedida si venía de una página protegida', async () => {
      social.resolveLogin.mockResolvedValue({ kind: 'session', userId: 7n });

      await callback({ volver: '/prestador/contrataciones' });

      expect(session.start).toHaveBeenCalledWith(res, 7n, false);
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4200/prestador/contrataciones');
    });

    it('guarda "recordarme" en el registro pendiente y lleva a completar el perfil', async () => {
      social.resolveLogin.mockResolvedValue({ kind: 'pending', identity });

      await callback({ rol: 'prestador', recordar: true });

      expect(social.signPending).toHaveBeenCalledWith(identity, true);
      expect(session.start).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:4200/auth/completar-perfil?rol=prestador',
      );
    });
  });
});
