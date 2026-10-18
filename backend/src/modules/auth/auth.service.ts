import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { Response } from 'express';
import { MailService } from '../../mail/mail.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthTokensService } from './session/auth-tokens.service';
import {
  AccountStatus,
  authError,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  Profile,
  ProfileName,
  termsAcceptedEvent,
  TokenType,
} from './auth.constants';
import { CaptchaService } from './captcha/captcha.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterClientDto,
  RegisterProviderDto,
  ResetPasswordDto,
  SwitchProfileDto,
} from './dto/auth.dto';
import type { PersonalDataDto } from './dto/personal-data.dto';
import { SessionService } from './session/session.service';
import { assertTrades } from '../categories/trades';

export function splitName(full: string): [string, string | null] {

  const [first, ...rest] = full.trim().split(/\s+/);

  return [first, rest.length ? rest.join(' ') : null];
}

let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('confiance-dummy-password'));

const OPEN_REQUEST_STATUSES = ['solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado'];

const INVALID_CREDENTIALS = () =>
  authError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son correctos.');

@Injectable()
export class AuthService {

  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mail: MailService,
    private captcha: CaptchaService,
    private tokens: AuthTokensService,
    private session: SessionService,
    private storage: StorageService,
  ) {}

  async registerClient(dto: RegisterClientDto) {

    await this.captcha.verify(dto.captchaToken);

    return this.register(dto, Profile.CLIENT);
  }

  async registerProvider(dto: RegisterProviderDto) {

    await this.captcha.verify(dto.captchaToken);

    return this.register(dto, Profile.PROVIDER);
  }

  private async register(dto: RegisterClientDto | RegisterProviderDto, profile: ProfileName) {

    const nit = 'nit' in dto ? dto.nit || null : null;
    const categoryIds = 'oficios' in dto ? dto.oficios.map(Number) : [];

    await this.assertAvailable(dto.email, dto.cedula, nit);

    await assertTrades(this.prisma, categoryIds);

    const [firstName, middleName] = splitName(dto.nombres);
    const [lastName, secondLastName] = splitName(dto.apellidos);
    const passwordHash = await argon2.hash(dto.password);

    let verificationToken: string;

    try {

      verificationToken = await this.prisma.$transaction(async (tx) => {

        const [status, activeProfile] = await Promise.all([
          tx.account_statuses.findUniqueOrThrow({ where: { status_name: AccountStatus.PENDING_VERIFICATION } }),
          tx.active_profiles.findUniqueOrThrow({ where: { profile_name: profile } }),
        ]);

        const user = await tx.users.create({
          data: {
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            second_last_name: secondLastName,
            phone: dto.telefono,
            email: dto.email,
            id_number: dto.cedula,
            password_hash: passwordHash,
            active_profile_id: activeProfile.active_profile_id,
            status_id: status.status_id,
          },
        });

        if (profile === Profile.CLIENT) {

          await tx.client_profiles.create({ data: { user_id: user.user_id } });
        } else {

          const provider = await tx.provider_profiles.create({ data: { user_id: user.user_id, nit } });

          await tx.provider_categories.createMany({
            data: categoryIds.map((category_id) => ({
              provider_profile_id: provider.provider_profile_id,
              category_id,
            })),
          });
        }

        await tx.audit_events.create({ data: termsAcceptedEvent(user.user_id) });

        return this.tokens.issue(user.user_id, TokenType.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS, tx);
      });
    } catch (err) {

      throw this.mapUniqueViolation(err);
    }

    await this.sendVerification(dto.email, verificationToken);

    return { email: dto.email };
  }

  private async assertAvailable(email: string, idNumber: string, nit: string | null) {

    const [byEmail, byIdNumber, byNit] = await Promise.all([
      this.prisma.users.findUnique({ where: { email }, select: { user_id: true } }),
      this.prisma.users.findUnique({ where: { id_number: idNumber }, select: { user_id: true } }),
      nit ? this.prisma.provider_profiles.findUnique({ where: { nit }, select: { user_id: true } }) : null,
    ]);

    if (byEmail) throw authError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este correo ya está registrado.');
    if (byIdNumber) throw authError(HttpStatus.CONFLICT, 'CEDULA_TAKEN', 'Esta cédula ya está registrada.');
    if (byNit) throw authError(HttpStatus.CONFLICT, 'NIT_TAKEN', 'Este NIT ya está registrado.');
  }

  private mapUniqueViolation(err: unknown) {

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {

      const target = String(err.meta?.target ?? '');

      if (target.includes('email')) return authError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este correo ya está registrado.');
      if (target.includes('id_number')) return authError(HttpStatus.CONFLICT, 'CEDULA_TAKEN', 'Esta cédula ya está registrada.');
      if (target.includes('nit')) return authError(HttpStatus.CONFLICT, 'NIT_TAKEN', 'Este NIT ya está registrado.');
    }

    return err;
  }

  private async sendVerification(email: string, rawToken: string) {

    const link = `${this.config.get('API_PUBLIC_URL')}/auth/verify-email?token=${rawToken}`;

    try {

      await this.mail.sendVerificationEmail(email, link);
    } catch (err) {

      this.logger.error(`No se pudo enviar el correo de verificación a ${email}: ${(err as Error).message}`);
    }
  }

  async verifyEmail(rawToken: string) {

    const userId = await this.tokens.consume(rawToken, TokenType.EMAIL_VERIFICATION);

    if (userId === null) return false;

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: { account_statuses: true },
    });

    const active = await this.prisma.account_statuses.findUniqueOrThrow({
      where: { status_name: AccountStatus.ACTIVE },
    });

    await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        email_verified: true,
        // Una cuenta deshabilitada no se reactiva al verificar el correo
        ...(user.account_statuses.status_name === AccountStatus.PENDING_VERIFICATION
          ? { status_id: active.status_id }
          : {}),
      },
    });

    return true;
  }

  async resendVerification(email: string) {

    const user = await this.prisma.users.findUnique({ where: { email } });

    if (user) await this.reissueVerification(user);
  }

  /** HU-05.4 con la sesión iniciada: quien entró sin verificar pide el enlace sin escribir su correo. */
  async resendMyVerification(userId: bigint) {

    await this.reissueVerification(await this.prisma.users.findUniqueOrThrow({ where: { user_id: userId } }));
  }

  private async reissueVerification(user: { user_id: bigint; email: string; email_verified: boolean }) {

    if (user.email_verified) return;

    await this.tokens.revokeAll(user.user_id, TokenType.EMAIL_VERIFICATION);

    const raw = await this.tokens.issue(user.user_id, TokenType.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS);

    await this.sendVerification(user.email, raw);
  }

  async login(dto: LoginDto, res: Response) {

    await this.captcha.verify(dto.captchaToken);

    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
      include: { account_statuses: true },
    });

    const valid = await argon2.verify(user?.password_hash ?? (await getDummyHash()), dto.password);

    if (!user?.password_hash || !valid) throw INVALID_CREDENTIALS();

    if (user.account_statuses.status_name === AccountStatus.DISABLED) {

      throw authError(HttpStatus.FORBIDDEN, 'ACCOUNT_DISABLED', 'Tu cuenta está deshabilitada.');
    }

    await this.session.start(res, user.user_id, dto.recordar ?? false);

    return this.me(user.user_id);
  }

  async me(userId: bigint) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: {
        active_profiles: true,
        client_profiles: { select: { client_profile_id: true } },
        provider_profiles: { select: { provider_profile_id: true } },
      },
    });

    return {
      id: user.user_id.toString(),
      email: user.email,
      nombres: [user.first_name, user.middle_name].filter(Boolean).join(' '),
      apellidos: [user.last_name, user.second_last_name].filter(Boolean).join(' '),
      emailVerificado: user.email_verified,
      perfilActivo: user.active_profiles.profile_name as ProfileName,
      perfiles: {
        cliente: user.client_profiles !== null,
        prestador: user.provider_profiles !== null,
      },
      esAdmin: user.is_admin,
      revisarPerfil: user.profile_review_required,
      fotoUrl: this.storage.publicUrl(user.profile_photo_url),
    };
  }

  /** D-47: datos que el dueño revisa tras vincular una cuenta que no tenía el correo verificado. */
  async personalData(userId: bigint) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: {
        provider_profiles: { select: { nit: true, provider_categories: { select: { category_id: true } } } },
      },
    });

    return {
      nombres: [user.first_name, user.middle_name].filter(Boolean).join(' '),
      apellidos: [user.last_name, user.second_last_name].filter(Boolean).join(' '),
      cedula: user.id_number,
      telefono: user.phone,
      prestador: user.provider_profiles
        ? {
            nit: user.provider_profiles.nit,
            oficios: user.provider_profiles.provider_categories.map((c) => c.category_id.toString()),
          }
        : null,
    };
  }

  async confirmPersonalData(userId: bigint, dto: PersonalDataDto) {

    const [first_name, middle_name] = splitName(dto.nombres);
    const [last_name, second_last_name] = splitName(dto.apellidos);

    const provider = await this.prisma.provider_profiles.findUnique({
      where: { user_id: userId },
      select: { provider_profile_id: true },
    });

    const categoryIds = (dto.oficios ?? []).map(Number);

    if (provider) {

      if (!categoryIds.length) {

        throw authError(HttpStatus.BAD_REQUEST, 'TRADES_REQUIRED', 'Elige entre 1 y 3 oficios.');
      }

      await assertTrades(this.prisma, categoryIds);
    }

    try {

      await this.prisma.$transaction(async (tx) => {

        await tx.users.update({
          where: { user_id: userId },
          data: {
            first_name,
            middle_name,
            last_name,
            second_last_name,
            id_number: dto.cedula,
            phone: dto.telefono,
            profile_review_required: false,
          },
        });

        if (provider) {

          await tx.provider_profiles.update({
            where: { provider_profile_id: provider.provider_profile_id },
            data: { nit: dto.nit || null },
          });

          await tx.provider_categories.deleteMany({ where: { provider_profile_id: provider.provider_profile_id } });
          await tx.provider_categories.createMany({
            data: categoryIds.map((category_id) => ({ provider_profile_id: provider.provider_profile_id, category_id })),
          });
        }
      });

    } catch (err) {

      throw this.mapUniqueViolation(err);
    }

    return this.me(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto) {

    await this.captcha.verify(dto.captchaToken);

    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
      include: { account_statuses: true },
    });

    if (!user || user.account_statuses.status_name === AccountStatus.DISABLED) return;

    await this.tokens.revokeAll(user.user_id, TokenType.PASSWORD_RESET);

    const raw = await this.tokens.issue(user.user_id, TokenType.PASSWORD_RESET, PASSWORD_RESET_TTL_MS);
    const link = `${this.config.get('FRONTEND_URL')}/auth/restablecer-contrasena?token=${raw}`;

    try {

      await this.mail.sendPasswordResetEmail(user.email, link);
    } catch (err) {

      this.logger.error(`No se pudo enviar el correo de recuperación a ${user.email}: ${(err as Error).message}`);
    }
  }

  async resetPassword(dto: ResetPasswordDto) {

    const userId = await this.tokens.consume(dto.token, TokenType.PASSWORD_RESET);

    if (userId === null) {

      throw authError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'El enlace no es válido o ya venció. Solicita uno nuevo.');
    }

    const [user, active] = await Promise.all([
      this.prisma.users.findUniqueOrThrow({ where: { user_id: userId }, include: { account_statuses: true } }),
      this.prisma.account_statuses.findUniqueOrThrow({ where: { status_name: AccountStatus.ACTIVE } }),
    ]);

    // Abrir el enlace demuestra que el correo es suyo, igual que verificarlo. Si no estaba verificado,
    // la cuenta pudo crearla otra persona con este correo: sus datos los revisa el dueño al entrar (D-47)
    await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        password_hash: await argon2.hash(dto.password),
        ...(user.email_verified
          ? {}
          : {
              email_verified: true,
              profile_review_required: true,
              ...(user.account_statuses.status_name === AccountStatus.PENDING_VERIFICATION
                ? { status_id: active.status_id }
                : {}),
            }),
      },
    });

    if (!user.email_verified) await this.tokens.revokeAll(userId, TokenType.EMAIL_VERIFICATION);

    await this.session.revokeAll(userId);
  }

  async switchProfile(userId: bigint, sessionId: bigint, dto: SwitchProfileDto, res: Response) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      select: {
        client_profiles: { select: { client_profile_id: true } },
        provider_profiles: { select: { provider_profile_id: true } },
      },
    });

    const exists = dto.perfil === Profile.CLIENT ? user.client_profiles !== null : user.provider_profiles !== null;
    const categoryIds = (dto.oficios ?? []).map(Number);
    const nit = dto.nit || null;

    if (!exists && dto.perfil === Profile.PROVIDER) {

      if (!categoryIds.length) {

        throw authError(HttpStatus.BAD_REQUEST, 'TRADES_REQUIRED', 'Elige entre 1 y 3 oficios para activar tu perfil de prestador.');
      }

      await assertTrades(this.prisma, categoryIds);

      if (nit && (await this.prisma.provider_profiles.findUnique({ where: { nit }, select: { user_id: true } }))) {

        throw authError(HttpStatus.CONFLICT, 'NIT_TAKEN', 'Este NIT ya está registrado.');
      }
    }

    try {

      await this.prisma.$transaction(async (tx) => {

        const profile = await tx.active_profiles.findUniqueOrThrow({ where: { profile_name: dto.perfil } });

        if (!exists) {

          if (dto.perfil === Profile.CLIENT) {

            await tx.client_profiles.create({ data: { user_id: userId } });
          } else {

            await tx.provider_profiles.create({
              data: {
                user_id: userId,
                nit,
                provider_categories: { create: categoryIds.map((category_id) => ({ category_id })) },
              },
            });
          }

          await tx.audit_events.create({
            data: { actor_id: userId, event_type: 'profile_activated', entity_type: 'users', entity_id: userId },
          });
        }

        await tx.users.update({ where: { user_id: userId }, data: { active_profile_id: profile.active_profile_id } });
      });
    } catch (err) {

      throw this.mapUniqueViolation(err);
    }

    await this.session.reissueAccess(res, userId, sessionId);

    return this.me(userId);
  }

  async disableAccount(userId: bigint, res: Response) {

    const open = await this.prisma.service_requests.count({
      where: {
        OR: [{ client_id: userId }, { provider_profiles: { user_id: userId } }],
        request_statuses: { status_name: { in: OPEN_REQUEST_STATUSES } },
      },
    });

    if (open) {

      throw authError(
        HttpStatus.CONFLICT,
        'OPEN_CONTRACTS',
        'No puedes deshabilitar tu cuenta mientras tengas contrataciones sin cerrar.',
      );
    }

    const disabled = await this.prisma.account_statuses.findUniqueOrThrow({
      where: { status_name: AccountStatus.DISABLED },
    });

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { user_id: userId },
        data: { status_id: disabled.status_id, disabled_at: new Date() },
      }),
      this.prisma.audit_events.create({
        data: { actor_id: userId, event_type: 'account_disabled', entity_type: 'users', entity_id: userId },
      }),
    ]);

    await this.session.endAll(res, userId);
  }
}
