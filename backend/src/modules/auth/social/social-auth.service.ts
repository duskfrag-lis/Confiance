import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountStatus, authError, Profile, ProfileName, termsAcceptedEvent } from '../auth.constants';
import { splitName } from '../auth.service';
import { assertTrades } from '../../categories/trades';
import { CompleteSocialDto } from './dto/complete-social.dto';
import type { AccountRole, SocialIdentity, SocialProvider } from './social-identity';

export const PENDING_COOKIE = 'social_pending';
const PENDING_AUDIENCE = 'social-pending';
const PENDING_EXPIRES_S = 15 * 60;

export type SocialLoginError = 'cuenta-deshabilitada' | 'social';

export type SocialLoginOutcome =
  | { kind: 'session'; userId: bigint }
  | { kind: 'pending'; identity: SocialIdentity }
  | { kind: 'error'; code: SocialLoginError };

export interface PendingSignup {
  provider: SocialProvider;
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** "Mantener la sesión iniciada" elegido antes de salir al proveedor. */
  remember: boolean;
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
      select: { user_id: true, email_verified: true, account_statuses: { select: { status_name: true } } },
    });

    if (existing) {

      if (existing.account_statuses.status_name === AccountStatus.DISABLED) {

        return { kind: 'error', code: 'cuenta-deshabilitada' };
      }

      return (await this.linkIdentity(existing, identity, providerId))
        ? { kind: 'session', userId: existing.user_id }
        : { kind: 'error', code: 'social' };
    }

    return { kind: 'pending', identity };
  }

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

    await assertTrades(this.prisma, categoryIds);

    try {

      return await this.prisma.$transaction(async (tx) => {

        const user = await tx.users.create({
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

        await tx.audit_events.create({ data: termsAcceptedEvent(user.user_id) });

        return user.user_id;
      });

    } catch (err) {

      throw mapUniqueViolation(err);
    }
  }

  async signPending(identity: SocialIdentity, remember: boolean): Promise<string> {

    const payload: PendingSignup = {
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email!,
      firstName: identity.firstName,
      lastName: identity.lastName,
      remember,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: PENDING_EXPIRES_S,
      audience: PENDING_AUDIENCE,
    });
  }

  async readPending(token: string | undefined): Promise<PendingSignup | null> {

    if (!token) return null;

    try {

      const { provider, providerUserId, email, firstName, lastName, remember } =
        await this.jwt.verifyAsync<PendingSignup>(token, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
          audience: PENDING_AUDIENCE,
        });

      return { provider, providerUserId, email, firstName, lastName, remember: remember === true };

    } catch {

      return null;
    }
  }

  private async linkIdentity(
    user: { user_id: bigint; email_verified: boolean; account_statuses: { status_name: string } },
    identity: SocialIdentity,
    providerId: number,
  ): Promise<boolean> {

    try {

      await this.prisma.$transaction(async (tx) => {

        await tx.user_identities.create({
          data: {
            user_id: user.user_id,
            identity_provider_id: providerId,
            provider_user_id: identity.providerUserId,
            last_login_at: new Date(),
          },
        });

        if (!user.email_verified) {

          const active = await tx.account_statuses.findUniqueOrThrow({ where: { status_name: AccountStatus.ACTIVE } });

          await tx.users.update({
            where: { user_id: user.user_id },
            data: {
              email_verified: true,
              password_hash: null,
              ...(user.account_statuses.status_name === AccountStatus.PENDING_VERIFICATION
                ? { status_id: active.status_id }
                : {}),
            },
          });
        }

        await tx.audit_events.create({
          data: { actor_id: user.user_id, event_type: 'identity_linked', entity_type: 'users', entity_id: user.user_id },
        });
      });

      return true;

    } catch (err) {

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
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

function mapUniqueViolation(err: unknown): unknown {

  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return err;

  const target = String(err.meta?.target ?? '');

  if (target.includes('email')) return authError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este correo ya está registrado.');
  if (target.includes('id_number')) return authError(HttpStatus.CONFLICT, 'CEDULA_TAKEN', 'Esta cédula ya está registrada.');
  if (target.includes('nit')) return authError(HttpStatus.CONFLICT, 'NIT_TAKEN', 'Este NIT ya está registrado.');

  return err;
}