import { ExecutionContext } from '@nestjs/common';
import { OAuthGuard } from './oauth.guard';

const context = (query: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ query }) }) }) as unknown as ExecutionContext;

describe('OAuthGuard.handleRequest', () => {
  const guard = new (OAuthGuard('google'))() as unknown as {
    handleRequest: (err: unknown, user: unknown, info: unknown, ctx: ExecutionContext) => unknown;
  };

  it('incluye el motivo de Passport cuando el state no coincide', () => {
    expect(() => guard.handleRequest(null, false, { message: 'Invalid OAuth state' }, context({}))).toThrow(
      'OAuth sin usuario: Invalid OAuth state',
    );
  });

  it('usa ?error= del proveedor cuando el usuario cancela', () => {
    expect(() => guard.handleRequest(null, false, undefined, context({ error: 'access_denied' }))).toThrow(
      'OAuth sin usuario: access_denied',
    );
  });

  it('deja el rol del state en la petición cuando todo sale bien', () => {
    const req: Record<string, unknown> = { query: {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;

    expect(guard.handleRequest(null, { provider: 'google' }, { state: { rol: 'prestador' } }, ctx)).toEqual({ provider: 'google' });
    expect(req.oauthState).toEqual({ rol: 'prestador' });
  });
});
