import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const findUnique = jest.fn();
  const config = { get: () => 'secreto-de-prueba' } as unknown as ConfigService;
  const strategy = new JwtStrategy(config, { users: { findUnique } } as unknown as PrismaService);
  const payload = { sub: '7', profile: 'client' as const, adm: false, sid: '3' };

  const future = new Date(Date.now() + 60_000);
  const user = (status = 'active', session: object | null = { revoked_at: null, expires_at: future }, isAdmin = false) => ({
    is_admin: isAdmin,
    account_statuses: { status_name: status },
    user_sessions: session ? [session] : [],
  });

  it('deja pasar una cuenta activa con su sesión abierta', async () => {
    findUnique.mockResolvedValue(user());

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 7n, sessionId: 3n, activeProfile: 'client', isAdmin: false,
    });
    expect(findUnique.mock.calls.at(-1)[0].select.user_sessions.where).toEqual({ session_id: 3n });
  });

  it('toma el permiso de administrador de la base, no del token (D-11)', async () => {
    findUnique.mockResolvedValue(user('active', undefined, false));
    await expect(strategy.validate({ ...payload, adm: true })).resolves.toMatchObject({ isAdmin: false });

    findUnique.mockResolvedValue(user('active', undefined, true));
    await expect(strategy.validate(payload)).resolves.toMatchObject({ isAdmin: true });
  });

  it('rechaza el token de una cuenta deshabilitada (HU-07)', async () => {
    findUnique.mockResolvedValue(user('disabled'));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza al instante el token de una sesión cerrada', async () => {
    findUnique.mockResolvedValue(user('active', { revoked_at: new Date(), expires_at: future }));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza el token si la sesión no es de ese usuario o ya venció', async () => {
    findUnique.mockResolvedValue(user('active', null));
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);

    findUnique.mockResolvedValue(user('active', { revoked_at: null, expires_at: new Date(Date.now() - 1000) }));
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza tokens viejos sin sesión (sid)', async () => {
    await expect(strategy.validate({ sub: '7', profile: 'client', adm: false } as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza el token de un usuario que no existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
