import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../../prisma/prisma.service';
import { AuthTokensService } from './auth-tokens.service';
import { BROWSER_SESSION_MS, parseDuration, REFRESH_REUSE_GRACE_MS, SessionService } from './session.service';

describe('parseDuration', () => {
  it('convierte las duraciones de JWT_*_EXPIRES', () => {
    expect(parseDuration('15m')).toBe(15 * 60_000);
    expect(parseDuration('30d')).toBe(30 * 86_400_000);
    expect(parseDuration('30s')).toBe(30_000);
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => parseDuration('1w')).toThrow();
  });
});

describe('SessionService', () => {
  const THIRTY_DAYS = 30 * 86_400_000;
  const env: Record<string, string> = { JWT_ACCESS_EXPIRES: '15m', JWT_REFRESH_EXPIRES: '30d', JWT_ACCESS_SECRET: 'secreto' };
  const hash = AuthTokensService.hash;

  let sessions: Record<string, jest.Mock>;
  let service: SessionService;
  let jwt: JwtService;
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };
  const req = { cookies: { refresh_token: 'viejo' } } as any;

  beforeEach(() => {
    sessions = {
      create: jest.fn().mockResolvedValue({ session_id: 3n }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const user = { user_id: 7n, is_admin: false, active_profiles: { profile_name: 'client' } };
    const prisma = { users: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) }, user_sessions: sessions };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;

    jwt = new JwtService();
    service = new SessionService(config, jwt, prisma as unknown as PrismaService);
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  const cookie = (name: string) => res.cookie.mock.calls.find(([n]) => n === name);
  const accessSid = () => jwt.decode(cookie('access_token')![1]).sid;

  const row = (overrides: object = {}) => ({
    session_id: 3n,
    user_id: 7n,
    remember: true,
    revoked_at: null,
    rotated_at: null,
    expires_at: new Date(Date.now() + 60_000),
    users: { account_statuses: { status_name: 'active' } },
    ...overrides,
  });

  describe('start', () => {
    it('con "Mantener la sesión" abre una sesión de 30 días con cookie persistente', async () => {
      await expect(service.start(res as any, 7n, true)).resolves.toBe('client');

      const { data } = sessions.create.mock.calls[0][0];
      expect(data).toMatchObject({ user_id: 7n, remember: true });
      expect(data.expires_at.getTime() - Date.now()).toBeGreaterThan(THIRTY_DAYS - 5000);
      expect(cookie('refresh_token')![2].maxAge).toBe(THIRTY_DAYS);
      expect(accessSid()).toBe('3');
    });

    it('sin "Mantener la sesión" la cookie muere con el navegador y la sesión dura máximo 12 h', async () => {
      await service.start(res as any, 7n, false);

      const { data } = sessions.create.mock.calls[0][0];
      expect(data.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(BROWSER_SESSION_MS);
      expect(cookie('refresh_token')![2].maxAge).toBeUndefined();
    });

    it('solo guarda el hash del refresh token', async () => {
      await service.start(res as any, 7n, true);

      expect(sessions.create.mock.calls[0][0].data.refresh_token_hash).toBe(hash(cookie('refresh_token')![1]));
    });

    it('la cookie del access token no sobrevive al cierre del navegador', async () => {
      await service.start(res as any, 7n, false);

      expect(cookie('access_token')![2].maxAge).toBeUndefined();
    });
  });

  describe('rotate', () => {
    it('rota el token de la misma sesión y reinicia el plazo de 30 días', async () => {
      sessions.findUnique.mockResolvedValue(row());

      await service.rotate(req, res as any);

      const { where, data } = sessions.updateMany.mock.calls[0][0];
      expect(where).toEqual({ session_id: 3n, refresh_token_hash: hash('viejo'), revoked_at: null });
      expect(data.previous_token_hash).toBe(hash('viejo'));
      expect(data.refresh_token_hash).toBe(hash(cookie('refresh_token')![1]));
      expect(data.expires_at.getTime() - Date.now()).toBeGreaterThan(THIRTY_DAYS - 5000);
      expect(cookie('refresh_token')![2].maxAge).toBe(THIRTY_DAYS);
      expect(accessSid()).toBe('3');
    });

    it('conserva una sesión de navegador como de navegador', async () => {
      sessions.findUnique.mockResolvedValue(row({ remember: false }));

      await service.rotate(req, res as any);

      expect(cookie('refresh_token')![2].maxAge).toBeUndefined();
    });

    it.each([
      ['cerrada', { revoked_at: new Date() }],
      ['vencida', { expires_at: new Date(Date.now() - 1000) }],
      ['de una cuenta deshabilitada', { users: { account_statuses: { status_name: 'disabled' } } }],
    ])('rechaza una sesión %s y borra las cookies', async (_name, overrides) => {
      sessions.findUnique.mockResolvedValue(row(overrides));

      await expect(service.rotate(req, res as any)).rejects.toBeInstanceOf(HttpException);
      expect(sessions.updateMany).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('otra pestaña que renueva a la vez recibe acceso sin tocar la cookie de refresh', async () => {
      sessions.findFirst.mockResolvedValue(row({ rotated_at: new Date(Date.now() - 1000) }));

      await service.rotate(req, res as any);

      expect(cookie('access_token')).toBeDefined();
      expect(cookie('refresh_token')).toBeUndefined();
      expect(sessions.update).not.toHaveBeenCalled();
    });

    it('un token ya rotado fuera del margen se trata como robado y cierra solo esa sesión', async () => {
      sessions.findFirst.mockResolvedValue(row({ rotated_at: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) }));

      await expect(service.rotate(req, res as any)).rejects.toBeInstanceOf(HttpException);
      expect(sessions.update).toHaveBeenCalledWith({ where: { session_id: 3n }, data: { revoked_at: expect.any(Date) } });
      expect(sessions.updateMany).not.toHaveBeenCalled();
    });

    it('si otra petición rotó primero, comparte su rotación en vez de pisarla', async () => {
      sessions.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ rotated_at: new Date() }));
      sessions.updateMany.mockResolvedValue({ count: 0 });

      await service.rotate(req, res as any);

      expect(cookie('access_token')).toBeDefined();
      expect(cookie('refresh_token')).toBeUndefined();
    });

    it('rechaza un token desconocido', async () => {
      await expect(service.rotate(req, res as any)).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('cierre', () => {
    it('cerrar sesión cierra solo la de este dispositivo', async () => {
      await service.end(req, res as any);

      expect(sessions.updateMany).toHaveBeenCalledWith({
        where: { OR: [{ refresh_token_hash: hash('viejo') }, { previous_token_hash: hash('viejo') }], revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('cerrar todas cierra cada sesión abierta de la cuenta', async () => {
      await service.revokeAll(7n);

      expect(sessions.updateMany).toHaveBeenCalledWith({
        where: { user_id: 7n, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
    });
  });
});
