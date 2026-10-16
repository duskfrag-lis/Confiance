import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const findUnique = jest.fn();
  const config = { get: () => 'secreto-de-prueba' } as unknown as ConfigService;
  const strategy = new JwtStrategy(config, { users: { findUnique } } as unknown as PrismaService);
  const payload = { sub: '7', profile: 'client' as const, adm: false };

  it('deja pasar una cuenta activa', async () => {
    findUnique.mockResolvedValue({ account_statuses: { status_name: 'active' } });

    await expect(strategy.validate(payload)).resolves.toEqual({ userId: 7n, activeProfile: 'client', isAdmin: false });
  });

  it('rechaza el token de una cuenta deshabilitada (HU-07)', async () => {
    findUnique.mockResolvedValue({ account_statuses: { status_name: 'disabled' } });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza el token de un usuario que no existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
