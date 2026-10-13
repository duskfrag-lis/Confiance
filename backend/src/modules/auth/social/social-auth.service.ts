import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountStatus, authError, Profile, ProfileName } from '../auth.constants';
import { splitName } from '../auth.service';
import { CompleteSocialDto } from './dto/complete-social.dto';
import type { AccountRole, SocialIdentity, SocialProvider } from './social-identity';

export const PENDING_COOKIE = 'social_pending';
const PENDING_AUDIENCE = 'social-pending';
const PENDING_EXPIRES_S = 15 * 60;

/**
 * Códigos que la pantalla de inicio de sesión entiende en `?error=` (SOCIAL_ERRORS del frontend).
 * `cuenta-con-otro-proveedor` es nuevo: el frontend aún no tiene mensaje para él.
 */
export type SocialLoginError =
  | 'cuenta-con-contrasena'
  | 'cuenta-con-otro-proveedor'
  | 'cuenta-deshabilitada'
  | 'social';

export type SocialLoginOutcome =
  | { kind: 'session'; userId: bigint }
  | { kind: 'pending'; identity: SocialIdentity }
  | { kind: 'error'; code: SocialLoginError };

/** Registro a medias: lo que se guarda (firmado) entre el callback y /social/complete. */
export interface PendingSignup {
  provider: SocialProvider;
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
}

const PROFILE_BY_ROLE: Record<AccountRole, ProfileName> = {
  cliente: Profile.CLIENT,
  prestador: Profile.PROVIDER,
};

@Injectable()
export class SocialAuthService {

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * Decide qué hacer con una identidad ya validada por el proveedor (HU-67):
   * 1. Identidad conocida              -> sesión (salvo cuenta deshabilitada).
   * 2. Correo no verificado            -> error.
   * 3. Correo de una cuenta existente  -> error; no se vincula automáticamente (V-1).
   * 4. Correo nuevo                    -> registro pendiente.
   */
  async resolveLogin(identity: SocialIdentity): Promise<SocialLoginOutcome> {

    const providerId = await this.providerId(identity.provider);

    const linked = await this.prisma.user_identities.findUnique({
      where: {
        identity_provider_id_provider_user_id: {
          identity_provider_id: providerId,
          provider_user_id: identity.providerUserId,
        },
      },
      select: {
        user_identity_id: true,
        users: { select: { user_id: true, account_statuses: { select: { status_name: true } } } },
      },
    });

    if (linked) {

      if (linked.users.account_statuses.status_name === AccountStatus.DISABLED) {

        return { kind: 'error', code: 'cuenta-deshabilitada' };
      }

      await this.prisma.user_identities.update({
        where: { user_identity_id: linked.user_identity_id },
        data: { last_login_at: new Date() },
      });

      return { kind: 'session', userId: linked.users.user_id };
    }

    if (!identity.email || !identity.emailVerified) return { kind: 'error', code: 'social' };

    const existing = await this.prisma.users.findUnique({
      where: { email: identity.email },
      select: { password_hash: true, account_statuses: { select: { status_name: true } } },
    });

    if (existing) {

      if (existing.account_statuses.status_name === AccountStatus.DISABLED) {

        return { kind: 'error', code: 'cuenta-deshabilitada' };
      }

      return {
        kind: 'error',
        code: existing.password_hash ? 'cuenta-con-contrasena' : 'cuenta-con-otro-proveedor',
      };
    }

    return { kind: 'pending', identity };
  }

  /**
   * Crea la cuenta con perfil, oficios e identidad en una sola escritura (atómica).
   * A diferencia del registro con contraseña, queda `active` y con el correo verificado (HU-05).
   */
  async completeSignup(pending: PendingSignup, dto: CompleteSocialDto): Promise<bigint> {

    const [first_name, middle_name] = splitName(dto.nombres);
    const [last_name, second_last_name] = splitName(dto.apellidos);

    const profileName = PROFILE_BY_ROLE[dto.rol];
    const categoryIds = profileName === Profile.PROVIDER ? (dto.oficios ?? []).map(Number) : [];

    const [providerId, status, profile] = await Promise.all([
      this.providerId(pending.provider),
      this.prisma.account_statuses.findUniqueOrThrow({ where: { status_name: AccountStatus.ACTIVE } }),
      this.prisma.active_profiles.findUniqueOrThrow({ where: { profile_name: profileName } }),
    ]);

    if (categoryIds.length) {

      const found = await this.prisma.categories.count({ where: { category_id: { in: categoryIds } } });

      if (found !== categoryIds.length) {

        throw authError(HttpStatus.BAD_REQUEST, 'INVALID_CATEGORY', 'Alguno de los oficios no existe.');
      }
    }

    try {

      const user = await this.prisma.users.create({
        data: {
          first_name,
          middle_name,
          last_name,
          second_last_name,
          phone: dto.telefono,
          email: pending.email,
          id_number: dto.cedula,
          password_hash: null,
          email_verified: true,
          status_id: status.status_id,
          active_profile_id: profile.active_profile_id,
          user_identities: {
            create: {
              identity_provider_id: providerId,
              provider_user_id: pending.providerUserId,
              last_login_at: new Date(),
            },
          },
          ...(profileName === Profile.CLIENT
            ? { client_profiles: { create: {} } }
            : {
                provider_profiles: {
                  create: {
                    nit: dto.nit || null,
                    provider_categories: { create: categoryIds.map((category_id) => ({ category_id })) },
                  },
                },
              }),
        },
        select: { user_id: true },
      });

      return user.user_id;

    } catch (err) {

      throw mapUniqueViolation(err);
    }
  }

  /**
   * El registro pendiente viaja como JWT en una cookie. Se firma con JWT_REFRESH_SECRET (el refresh
   * de la sesión es opaco y no la usa) y nunca con JWT_ACCESS_SECRET: la JwtStrategy no comprueba
   * audiencia y aceptaría este token como si fuera de acceso.
   */
  async signPending(identity: SocialIdentity): Promise<string> {

    const payload: PendingSignup = {
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email!,
      firstName: identity.firstName,
      lastName: identity.lastName,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: PENDING_EXPIRES_S,
      audience: PENDING_AUDIENCE,
    });
  }

  /** null si no hay registro pendiente o ya venció. */
  async readPending(token: string | undefined): Promise<PendingSignup | null> {

    if (!token) return null;

    try {

      const { provider, providerUserId, email, firstName, lastName } =
        await this.jwt.verifyAsync<PendingSignup>(token, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
          audience: PENDING_AUDIENCE,
        });

      return { provider, providerUserId, email, firstName, lastName };

    } catch {

      return null;
    }
  }

  private async providerId(provider: SocialProvider): Promise<number> {

    const row = await this.prisma.identity_providers.findUniqueOrThrow({
      where: { provider_name: provider },
      select: { identity_provider_id: true },
    });

    return row.identity_provider_id;
  }
}

/** Mismos códigos que el registro con contraseña (AuthService.mapUniqueViolation). */
function mapUniqueViolation(err: unknown): unknown {

  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return err;

  const target = String(err.meta?.target ?? '');

  if (target.includes('email')) return authError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este correo ya está registrado.');
  if (target.includes('id_number')) return authError(HttpStatus.CONFLICT, 'CEDULA_TAKEN', 'Esta cédula ya está registrada.');
  if (target.includes('nit')) return authError(HttpStatus.CONFLICT, 'NIT_TAKEN', 'Este NIT ya está registrado.');

  return err;
}