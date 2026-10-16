import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuthTokensService } from '../session/auth-tokens.service';
import { CompleteSocialDto } from './dto/complete-social.dto';
import { PendingSignup, SocialAuthService } from './social-auth.service';
import type { SocialIdentity } from './social-identity';

describe('SocialAuthService', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let service: SocialAuthService;
  let tokens: { revokeAll: jest.Mock };

  const identity = (overrides: Partial<SocialIdentity> = {}): SocialIdentity => ({
    provider: 'google',
    providerUserId: 'sub-1',
    email: 'laura@gmail.com',
    emailVerified: true,
    firstName: 'Laura',
    lastName: 'Gómez',
    ...overrides,
  });

  const userWithStatus = (status: string, password_hash: string | null = null) => ({
    password_hash,
    account_statuses: { status_name: status },
  });

  beforeEach(() => {
    prisma = {
      identity_providers: { findUniqueOrThrow: jest.fn().mockResolvedValue({ identity_provider_id: 1 }) },
      user_identities: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn() },
      users: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      account_statuses: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status_id: 2 }) },
      active_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ active_profile_id: 1 }) },
      categories: { count: jest.fn() },
      audit_events: { create: jest.fn() },
    };
    (prisma as any).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const config = { get: () => 'secreto-de-prueba' } as unknown as ConfigService;
    tokens = { revokeAll: jest.fn() };
    service = new SocialAuthService(
      prisma as unknown as PrismaService,
      new JwtService(),
      config,
      tokens as unknown as AuthTokensService,
    );
  });

  describe('resolveLogin', () => {
    it('inicia sesión si la identidad ya está vinculada y actualiza last_login_at', async () => {
      prisma.user_identities.findUnique.mockResolvedValue({
        user_identity_id: 5n,
        users: { user_id: 9n, account_statuses: { status_name: 'active' } },
      });

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'session', userId: 9n });
      expect(prisma.user_identities.update).toHaveBeenCalled();
    });

    it('bloquea una identidad vinculada a una cuenta deshabilitada (HU-07)', async () => {
      prisma.user_identities.findUnique.mockResolvedValue({
        user_identity_id: 5n,
        users: { user_id: 9n, account_statuses: { status_name: 'disabled' } },
      });

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'error', code: 'cuenta-deshabilitada' });
    });

    it.each([
      ['correo no verificado', { emailVerified: false }],
      ['sin correo', { email: null }],
    ])('rechaza con %s', async (_name, overrides) => {
      await expect(service.resolveLogin(identity(overrides))).resolves.toEqual({ kind: 'error', code: 'social' });
    });

    it('vincula la identidad a una cuenta existente con el correo verificado (D-47)', async () => {
      prisma.users.findUnique.mockResolvedValue({ user_id: 3n, email_verified: true, ...userWithStatus('active', 'hash') });

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'session', userId: 3n });
      expect(prisma.user_identities.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ user_id: 3n, identity_provider_id: 1, provider_user_id: 'sub-1' }),
      });
      expect(prisma.users.update).not.toHaveBeenCalled();
      expect(tokens.revokeAll).not.toHaveBeenCalled();
    });

    it('al vincular una cuenta sin correo verificado elimina su contraseña, la activa y pide revisar sus datos (D-47)', async () => {
      prisma.users.findUnique.mockResolvedValue({
        user_id: 3n,
        email_verified: false,
        ...userWithStatus('pending_verification', 'hash'),
      });

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'session', userId: 3n });
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { user_id: 3n },
        data: { email_verified: true, password_hash: null, profile_review_required: true, status_id: 2 },
      });
    });

    it('al vincular una cuenta sin correo verificado cierra las sesiones abiertas con la contraseña (D-47)', async () => {
      prisma.users.findUnique.mockResolvedValue({
        user_id: 3n,
        email_verified: false,
        ...userWithStatus('pending_verification', 'hash'),
      });

      await service.resolveLogin(identity());

      expect(tokens.revokeAll).toHaveBeenCalledWith(3n, 'refresh_session', prisma);
    });

    it('no vincula una cuenta deshabilitada', async () => {
      prisma.users.findUnique.mockResolvedValue({ user_id: 3n, email_verified: true, ...userWithStatus('disabled', 'hash') });

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'error', code: 'cuenta-deshabilitada' });
      expect(prisma.user_identities.create).not.toHaveBeenCalled();
    });

    it('no vincula si la cuenta ya tiene otra identidad de ese proveedor', async () => {
      prisma.users.findUnique.mockResolvedValue({ user_id: 3n, email_verified: true, ...userWithStatus('active') });
      prisma.user_identities.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test', meta: {} }),
      );

      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'error', code: 'social' });
    });

    it('deja el registro pendiente si el correo es nuevo', async () => {
      await expect(service.resolveLogin(identity())).resolves.toEqual({ kind: 'pending', identity: identity() });
    });
  });

  describe('registro pendiente', () => {
    it('firma y lee el registro pendiente', async () => {
      const token = await service.signPending(identity(), true);

      await expect(service.readPending(token)).resolves.toEqual({
        provider: 'google',
        providerUserId: 'sub-1',
        email: 'laura@gmail.com',
        firstName: 'Laura',
        lastName: 'Gómez',
        remember: true,
      });
    });

    it('ignora tokens ausentes o manipulados', async () => {
      await expect(service.readPending(undefined)).resolves.toBeNull();
      await expect(service.readPending('no.es.jwt')).resolves.toBeNull();
    });
  });

  describe('completeSignup', () => {
    const pending: PendingSignup = {
      provider: 'google', providerUserId: 'sub-1', email: 'laura@gmail.com', firstName: 'Laura', lastName: 'Gómez',
      remember: false,
    };

    const dto = (overrides: Partial<CompleteSocialDto> = {}): CompleteSocialDto => ({
      rol: 'cliente',
      nombres: 'Laura Marcela',
      apellidos: 'Gómez Ríos',
      cedula: '1020304050',
      telefono: '3001234567',
      aceptaTerminos: true,
      ...overrides,
    });

    it('crea usuario verificado, sin contraseña, con perfil de cliente e identidad', async () => {
      prisma.users.create.mockResolvedValue({ user_id: 7n });

      await expect(service.completeSignup(pending, dto())).resolves.toBe(7n);

      const { data } = prisma.users.create.mock.calls[0][0];
      expect(data).toMatchObject({
        first_name: 'Laura', middle_name: 'Marcela', last_name: 'Gómez', second_last_name: 'Ríos',
        email: 'laura@gmail.com', email_verified: true, password_hash: null,
        client_profiles: { create: {} },
        user_identities: { create: { identity_provider_id: 1, provider_user_id: 'sub-1' } },
      });
      expect(data.provider_profiles).toBeUndefined();
    });

    it('deja constancia de la aceptación de términos (D-33)', async () => {
      prisma.users.create.mockResolvedValue({ user_id: 7n });

      await service.completeSignup(pending, dto());

      expect(prisma.audit_events.create).toHaveBeenCalledWith({
        data: { actor_id: 7n, event_type: 'terms_accepted', entity_type: 'users', entity_id: 7n },
      });
    });

    it('crea el perfil de prestador con sus oficios en orden', async () => {
      prisma.categories.count.mockResolvedValue(2);
      prisma.users.create.mockResolvedValue({ user_id: 8n });

      await service.completeSignup(pending, dto({ rol: 'prestador', oficios: ['4', '2'], nit: '900123456-7' }));

      const { data } = prisma.users.create.mock.calls[0][0];
      expect(data.provider_profiles.create).toEqual({
        nit: '900123456-7',
        provider_categories: { create: [{ category_id: 4 }, { category_id: 2 }] },
      });
    });

    it('rechaza oficios que no existen', async () => {
      prisma.categories.count.mockResolvedValue(1);

      const error = await service.completeSignup(pending, dto({ rol: 'prestador', oficios: ['4', '99'] })).catch((e) => e);
      expect(error.getResponse()).toMatchObject({ code: 'INVALID_CATEGORY' });
      expect(prisma.users.create).not.toHaveBeenCalled();
    });

    it.each([
      [['id_number'], 'CEDULA_TAKEN'],
      [['nit'], 'NIT_TAKEN'],
      [['email'], 'EMAIL_TAKEN'],
    ])('traduce el UNIQUE de %s a %s', async (target, code) => {
      prisma.users.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test', meta: { target } }),
      );

      const error = await service.completeSignup(pending, dto()).catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code });
    });
  });
});