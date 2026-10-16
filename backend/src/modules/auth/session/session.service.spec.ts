import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuthTokensService } from './auth-tokens.service';
import { BROWSER_SESSION_MS, parseDuration, REFRESH_REUSE_GRACE_MS, SessionService } from './session.service';

describe('parseDuration', () => {
  it('convierte las duraciones de JWT_*_EXPIRES', () => {
    expect(parseDuration('15m')).toBe(15 * 60_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('30s')).toBe(30_000);
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => parseDuration('1w')).toThrow();
  });
});

describe('SessionService', () => {
  const env: Record<string, string> = { JWT_ACCESS_EXPIRES: '15m', JWT_REFRESH_EXPIRES: '7d', JWT_ACCESS_SECRET: 'secreto' };
  let tokens: Record<string, jest.Mock>;
  let service: SessionService;
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };
  const req = { cookies: { refresh_token: 'viejo' } } as any;

  beforeEach(() => {
    tokens = {
      consume: jest.fn().mockResolvedValue(null),
      findUsed: jest.fn(),
      hasActiveSince: jest.fn(),
      revokeAll: jest.fn(),
      issue: jest.fn().mockResolvedValue('nuevo'),
    };
    const user = { user_id: 7n, is_admin: false, active_profiles: { profile_name: 'client' }, account_statuses: { status_name: 'active' } };
    const prisma = { users: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) } };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;

    service = new SessionService(config, new JwtService(), prisma as unknown as PrismaService, tokens as unknown as AuthTokensService);
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  const SEVEN_DAYS = 7 * 86_400_000;
  const refreshCookie = () => res.cookie.mock.calls.find(([name]) => name === 'refresh_token')!;

  it('con "recordarme" emite el refresh largo y una cookie persistente', async () => {
    await expect(service.start(res as any, 7n, true)).resolves.toBe('client');

    expect(tokens.issue).toHaveBeenCalledWith(7n, 'refresh_session', SEVEN_DAYS);
    expect(refreshCookie()[2].maxAge).toBe(SEVEN_DAYS);
  });

  it('sin "recordarme" emite un refresh corto y una cookie de sesión del navegador', async () => {
    await service.start(res as any, 7n, false);

    expect(tokens.issue).toHaveBeenCalledWith(7n, 'refresh_session', BROWSER_SESSION_MS);
    expect(refreshCookie()[2].maxAge).toBeUndefined();
  });

  it.each([
    ['recordada', SEVEN_DAYS, SEVEN_DAYS],
    ['del navegador', BROWSER_SESSION_MS, undefined],
  ])('la rotación conserva una sesión %s', async (_name, ttlMs, maxAge) => {
    tokens.consume.mockResolvedValue(7n);
    tokens.findUsed.mockResolvedValue({ userId: 7n, usedAt: new Date(), ttlMs });

    await service.rotate(req, res as any);

    expect(refreshCookie()[2].maxAge).toBe(maxAge);
  });

  const usedAgo = (ms: number) => tokens.findUsed.mockResolvedValue({ userId: 7n, usedAt: new Date(Date.now() - ms) });

  it('otra pestaña que renueva a la vez recibe su propia sesión', async () => {
    usedAgo(1000);
    tokens.hasActiveSince.mockResolvedValue(true);

    await service.rotate(req, res as any);

    expect(tokens.revokeAll).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'nuevo', expect.anything());
  });

  it('si la otra pestaña aún no termina, responde 401 sin borrar sus cookies', async () => {
    usedAgo(1000);
    tokens.hasActiveSince.mockResolvedValue(false);

    await expect(service.rotate(req, res as any)).rejects.toBeInstanceOf(HttpException);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(tokens.revokeAll).not.toHaveBeenCalled();
  });

  it('fuera del margen se trata como robado y cierra todas las sesiones', async () => {
    usedAgo(REFRESH_REUSE_GRACE_MS + 1000);

    await expect(service.rotate(req, res as any)).rejects.toBeInstanceOf(HttpException);
    expect(tokens.revokeAll).toHaveBeenCalledWith(7n, 'refresh_session');
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
