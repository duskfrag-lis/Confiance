import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthTokensService } from './session/auth-tokens.service';
import { AuthService, splitName } from './auth.service';
import { CaptchaService } from './captcha/captcha.service';
import { RegisterClientDto, RegisterProviderDto } from './dto/auth.dto';
import { SessionService } from './session/session.service';

jest.mock('argon2', () => {
  const actual = jest.requireActual('argon2');

  return { ...actual, verify: jest.fn((hash: string, plain: string) => actual.verify(hash, plain)) };
});

const codeOf = async (promise: Promise<unknown>) => {

  try {

    await promise;
  } catch (err) {

    return ((err as HttpException).getResponse() as { code: string }).code;
  }

  throw new Error('se esperaba un error');
};

const client: RegisterClientDto = {
  nombres: 'Laura Marcela',
  apellidos: 'Gómez Ríos',
  cedula: '1020304050',
  telefono: '3001234567',
  email: 'laura@correo.com',
  password: 'Prueba123!',
  aceptaTerminos: true,
  captchaToken: 'ok',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let captcha: { verify: jest.Mock };
  let session: { start: jest.Mock; endAll: jest.Mock; reissueAccess: jest.Mock };
  let tokens: { issue: jest.Mock; consume: jest.Mock; revokeAll: jest.Mock };
  let mail: { sendVerificationEmail: jest.Mock; sendPasswordResetEmail: jest.Mock };

  beforeEach(async () => {
    prisma = {
      users: { findUnique: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      provider_profiles: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      client_profiles: { create: jest.fn() },
      active_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ active_profile_id: 2 }) },
      categories: { count: jest.fn() },
      account_statuses: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status_id: 1 }) },
      service_requests: { count: jest.fn().mockResolvedValue(0) },
      audit_events: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    captcha = { verify: jest.fn().mockResolvedValue(undefined) };
    session = { start: jest.fn(), endAll: jest.fn(), reissueAccess: jest.fn() };
    tokens = { issue: jest.fn().mockResolvedValue('raw'), consume: jest.fn(), revokeAll: jest.fn() };
    mail = { sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => `cfg:${k}` } },
        { provide: MailService, useValue: mail },
        { provide: CaptchaService, useValue: captcha },
        { provide: AuthTokensService, useValue: tokens },
        { provide: SessionService, useValue: session },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('splitName', () => {
    it('separa primer nombre y el resto', () => {
      expect(splitName('  Laura   Marcela ')).toEqual(['Laura', 'Marcela']);
      expect(splitName('Ana')).toEqual(['Ana', null]);
    });
  });

  describe('registro', () => {
    it('rechaza un correo ya registrado', async () => {
      prisma.users.findUnique.mockImplementation(({ where }: any) => (where.email ? { user_id: 1n } : null));

      expect(await codeOf(service.registerClient(client))).toBe('EMAIL_TAKEN');
    });

    it('rechaza una cédula ya registrada', async () => {
      prisma.users.findUnique.mockImplementation(({ where }: any) => (where.id_number ? { user_id: 1n } : null));

      expect(await codeOf(service.registerClient(client))).toBe('CEDULA_TAKEN');
    });

    it('rechaza oficios que no existen', async () => {
      prisma.categories.count.mockResolvedValue(1);
      const provider: RegisterProviderDto = { ...client, oficios: ['1', '99'], nit: null };

      expect(await codeOf(service.registerProvider(provider))).toBe('INVALID_CATEGORY');
    });

    it('traduce la carrera de unicidad (P2002) al código correcto', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['id_number'] } }),
      );

      expect(await codeOf(service.registerClient(client))).toBe('CEDULA_TAKEN');
    });

    it('crea la cuenta y envía el correo de verificación', async () => {
      prisma.$transaction.mockResolvedValue('raw-token');

      await expect(service.registerClient(client)).resolves.toEqual({ email: client.email });
      expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
        client.email,
        'cfg:API_PUBLIC_URL/auth/verify-email?token=raw-token',
      );
    });

    it('deja constancia de la aceptación de términos (D-33)', async () => {
      const tx = {
        account_statuses: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status_id: 1 }) },
        active_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ active_profile_id: 1 }) },
        users: { create: jest.fn().mockResolvedValue({ user_id: 7n }) },
        client_profiles: { create: jest.fn() },
        audit_events: { create: jest.fn() },
      };
      prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));

      await service.registerClient(client);

      expect(tx.audit_events.create).toHaveBeenCalledWith({
        data: { actor_id: 7n, event_type: 'terms_accepted', entity_type: 'users', entity_id: 7n },
      });
    });

    it('no crea nada si el reCAPTCHA falla', async () => {
      captcha.verify.mockRejectedValue(new Error('CAPTCHA_FAILED'));

      await expect(service.registerClient(client)).rejects.toThrow('CAPTCHA_FAILED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const res = {} as any;

    it('responde INVALID_CREDENTIALS si el correo no existe', async () => {
      expect(await codeOf(service.login({ email: 'x@y.co', password: 'a', captchaToken: 'ok' }, res))).toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('verifica contra un hash de relleno si el correo no existe (mismo tiempo de respuesta)', async () => {
      (argon2.verify as jest.Mock).mockClear();

      expect(await codeOf(service.login({ email: 'x@y.co', password: 'a', captchaToken: 'ok' }, res))).toBe(
        'INVALID_CREDENTIALS',
      );
      expect(argon2.verify).toHaveBeenCalledTimes(1);
    });

    it('responde INVALID_CREDENTIALS si la cuenta no tiene contraseña (OAuth)', async () => {
      prisma.users.findUnique.mockResolvedValue({ password_hash: null, account_statuses: { status_name: 'active' } });

      expect(await codeOf(service.login({ email: 'x@y.co', password: 'a', captchaToken: 'ok' }, res))).toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('bloquea una cuenta deshabilitada solo después de validar la contraseña', async () => {
      prisma.users.findUnique.mockResolvedValue({
        user_id: 7n,
        password_hash: await argon2.hash('Prueba123!'),
        account_statuses: { status_name: 'disabled' },
      });

      expect(await codeOf(service.login({ email: 'x@y.co', password: 'Prueba123!', captchaToken: 'ok' }, res))).toBe(
        'ACCOUNT_DISABLED',
      );
      expect(session.start).not.toHaveBeenCalled();
    });
  });

  describe('restablecer contraseña', () => {
    it('rechaza un token inválido o vencido', async () => {
      tokens.consume.mockResolvedValue(null);

      expect(await codeOf(service.resetPassword({ token: 't', password: 'Nueva123!' }))).toBe('INVALID_TOKEN');
    });

    it('cambia la contraseña y cierra todas las sesiones', async () => {
      tokens.consume.mockResolvedValue(7n);

      await service.resetPassword({ token: 't', password: 'Nueva123!' });

      expect(prisma.users.update).toHaveBeenCalled();
      expect(tokens.revokeAll).toHaveBeenCalledWith(7n, 'refresh_session');
    });
  });

  it('no revela si un correo existe al pedir recuperación', async () => {
    await expect(service.forgotPassword({ email: 'nadie@correo.com', captchaToken: 'ok' })).resolves.toBeUndefined();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  describe('cambio de perfil (HU-08)', () => {
    const res = {} as any;
    const profiles = (client: boolean, provider: boolean) => ({
      client_profiles: client ? { client_profile_id: 1n } : null,
      provider_profiles: provider ? { provider_profile_id: 1n } : null,
    });

    beforeEach(() => {
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
      jest.spyOn(service, 'me').mockResolvedValue({ perfilActivo: 'provider' } as any);
    });

    it('cambia al perfil existente sin crear nada y renueva el token de acceso', async () => {
      prisma.users.findUniqueOrThrow.mockResolvedValue(profiles(true, true));

      await service.switchProfile(7n, { perfil: 'provider' }, res);

      expect(prisma.provider_profiles.create).not.toHaveBeenCalled();
      expect(prisma.users.update).toHaveBeenCalledWith({ where: { user_id: 7n }, data: { active_profile_id: 2 } });
      expect(session.reissueAccess).toHaveBeenCalledWith(res, 7n);
    });

    it('pide oficios para activar el perfil de prestador por primera vez', async () => {
      prisma.users.findUniqueOrThrow.mockResolvedValue(profiles(true, false));

      expect(await codeOf(service.switchProfile(7n, { perfil: 'provider' }, res))).toBe('TRADES_REQUIRED');
    });

    it('crea el perfil de prestador con sus oficios', async () => {
      prisma.users.findUniqueOrThrow.mockResolvedValue(profiles(true, false));
      prisma.categories.count.mockResolvedValue(2);

      await service.switchProfile(7n, { perfil: 'provider', oficios: ['4', '6'], nit: null }, res);

      expect(prisma.provider_profiles.create).toHaveBeenCalledWith({
        data: { user_id: 7n, nit: null, provider_categories: { create: [{ category_id: 4 }, { category_id: 6 }] } },
      });
    });

    it('crea el perfil de cliente sin pedir datos', async () => {
      prisma.users.findUniqueOrThrow.mockResolvedValue(profiles(false, true));

      await service.switchProfile(7n, { perfil: 'client' }, res);

      expect(prisma.client_profiles.create).toHaveBeenCalledWith({ data: { user_id: 7n } });
    });
  });

  describe('deshabilitar cuenta (HU-07)', () => {
    it('no deshabilita con contrataciones sin cerrar (D-52)', async () => {
      prisma.service_requests.count.mockResolvedValue(1);

      expect(await codeOf(service.disableAccount(7n, {} as any))).toBe('OPEN_CONTRACTS');
      expect(session.endAll).not.toHaveBeenCalled();
    });
  });
});
