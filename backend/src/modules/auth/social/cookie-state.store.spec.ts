import type { Request } from 'express';
import { CookieStateStore, STATE_COOKIE } from './cookie-state.store';

describe('CookieStateStore', () => {
  const store = new CookieStateStore({ httpOnly: true, path: '/api/auth' });

  const fakeRequest = (cookies: Record<string, string> = {}) => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    return { req: { cookies, res } as unknown as Request, res };
  };

  const storeState = (rol: 'cliente' | 'prestador' | null) => {
    const { req, res } = fakeRequest();
    let nonce = '';
    store.store(req, { rol }, {}, (_err, state) => (nonce = state!));
    return { nonce, cookie: res.cookie.mock.calls[0][1] as string };
  };

  it('guarda el nonce y el rol en una cookie httpOnly', () => {
    const { nonce, cookie } = storeState('prestador');
    expect(nonce.length).toBeGreaterThan(20);
    expect(JSON.parse(cookie)).toEqual({ nonce, rol: 'prestador' });
  });

  it('acepta el state correcto, devuelve el rol y borra la cookie', () => {
    const { nonce, cookie } = storeState('cliente');
    const { req, res } = fakeRequest({ [STATE_COOKIE]: cookie });
    const callback = jest.fn();

    store.verify(req, nonce, callback);

    expect(callback).toHaveBeenCalledWith(null, true, { rol: 'cliente' });
    expect(res.clearCookie).toHaveBeenCalledWith(STATE_COOKIE, expect.anything());
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