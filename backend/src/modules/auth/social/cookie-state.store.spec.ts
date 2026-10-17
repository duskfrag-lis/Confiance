import type { Request } from 'express';
import { CookieStateStore, STATE_COOKIE } from './cookie-state.store';
import type { OAuthAppState } from './social-identity';

describe('CookieStateStore', () => {
  const store = new CookieStateStore({ httpOnly: true, path: '/api/auth' });

  const fakeRequest = (cookies: Record<string, string> = {}) => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    return { req: { cookies, res } as unknown as Request, res };
  };

  const storeState = (rol: 'cliente' | 'prestador' | null, extra: Partial<OAuthAppState> = {}) => {
    const { req, res } = fakeRequest();
    let nonce = '';
    store.store(req, { rol, recordar: false, volver: null, ...extra }, {}, (_err, state) => (nonce = state!));
    return { nonce, cookie: res.cookie.mock.calls[0][1] as string };
  };

  it('guarda el nonce, el rol, recordar y volver en una cookie httpOnly', () => {
    const { nonce, cookie } = storeState('prestador', { recordar: true, volver: '/prestador/agenda' });
    expect(nonce.length).toBeGreaterThan(20);
    expect(JSON.parse(cookie)).toEqual({ nonce, rol: 'prestador', recordar: true, volver: '/prestador/agenda' });
  });

  it('acepta el state correcto, devuelve el estado de la app y borra la cookie', () => {
    const { nonce, cookie } = storeState('cliente', { recordar: true, volver: '/cliente' });
    const { req, res } = fakeRequest({ [STATE_COOKIE]: cookie });
    const callback = jest.fn();

    store.verify(req, nonce, callback);

    expect(callback).toHaveBeenCalledWith(null, true, { rol: 'cliente', recordar: true, volver: '/cliente' });
    expect(res.clearCookie).toHaveBeenCalledWith(STATE_COOKIE, expect.anything());
  });

  it('vuelve a validar el rol y la ruta al leer la cookie', () => {
    const cookie = JSON.stringify({ nonce: 'n', rol: 'admin', recordar: 'si', volver: '//otro.com' });
    const { req } = fakeRequest({ [STATE_COOKIE]: cookie });
    const callback = jest.fn();

    store.verify(req, 'n', callback);

    expect(callback).toHaveBeenCalledWith(null, true, { rol: null, recordar: false, volver: null });
  });

  it.each([
    ['state distinto', 'otro-valor'],
    ['state ausente', undefined],
  ])('rechaza con %s', (_name, provided) => {
    const { cookie } = storeState(null);
    const { req } = fakeRequest({ [STATE_COOKIE]: cookie });
    const callback = jest.fn();

    store.verify(req, provided, callback);

    expect(callback).toHaveBeenCalledWith(null, false, expect.anything());
  });

  it('rechaza si no hay cookie o está corrupta', () => {
    const cases: Record<string, string>[] = [{}, { [STATE_COOKIE]: 'no-es-json' }];
    for (const cookies of cases) {
      const callback = jest.fn();
      store.verify(fakeRequest(cookies).req, 'algo', callback);
      expect(callback).toHaveBeenCalledWith(null, false, expect.anything());
    }
  });
});