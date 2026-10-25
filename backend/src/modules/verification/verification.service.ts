import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ReviewVerificationDto, SubmitVerificationDto } from './dto/verification.dto';
import {
  DOCUMENT_TYPE_LABEL, IDENTITY_FOLDER, MAX_VERIFICATION_PHOTOS, STATE_OF, STATUS_OF_DECISION, type Decision,
} from './verification.constants';

type Upload = { buffer: Buffer; size: number };

const SELECT = {
  identity_verification_id: true,
  document_number: true,
  additional_info: true,
  reviewed_by: true,
  review_notes: true,
  created_at: true,
  updated_at: true,
  document_types: { select: { document_type_id: true, type_name: true } },
  verification_statuses: { select: { status_name: true } },
  identity_verification_photos: { select: { photo_url: true }, orderBy: { identity_verification_photo_id: 'asc' } },
} satisfies Prisma.identity_verificationsSelect;

type Row = Prisma.identity_verificationsGetPayload<{ select: typeof SELECT }>;

const pendingExists = () => apiError(
  HttpStatus.CONFLICT, 'VERIFICATION_PENDING', 'Ya tienes una solicitud en revisión. Espera la respuesta antes de enviar otra.',
);

/** La base frena una segunda pendiente aunque dos envíos se crucen (fn_check_identity_verification). */
const translateDbRule = (err: unknown) =>
  err instanceof Error && err.message.includes('Ya hay una solicitud de verificación pendiente') ? pendingExists() : err;

const sentence = (text: string | null) => (text && !/[.!?]$/.test(text) ? `${text}.` : text);

const RESULT_MESSAGE: Record<Decision, (reason: string | null) => string> = {
  aprobada: () => 'Tu identidad quedó verificada: la insignia ya aparece en tu perfil público.',
  rechazada: (reason) => `Rechazamos tu verificación de identidad. Motivo: ${sentence(reason)} Puedes enviar una nueva solicitud.`,
  correccion: (reason) => `Tu verificación de identidad necesita una corrección: ${sentence(reason)} Envía una nueva solicitud con los cambios.`,
};

/**
 * E13 · Verificación de identidad: la solicitud del prestador (HU-55) y la revisión del administrador (HU-58). La
 * insignia (HU-56) sale de las vistas: aparece si la verificación más reciente está aprobada. Las fotos del documento
 * son privadas y solo se entregan con enlaces firmados de corta duración, al prestador y al administrador (HU-60).
 */
@Injectable()
export class VerificationService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-55 prestador

  async documentTypes() {

    const types = await this.prisma.document_types.findMany({ orderBy: { document_type_id: 'asc' } });

    return types.map((t) => ({ id: String(t.document_type_id), nombre: DOCUMENT_TYPE_LABEL[t.type_name] ?? t.type_name }));
  }

  /** HU-55.4: la solicitud más reciente con su motivo, y las anteriores. */
  async mine(userId: bigint) {

    const rows = await this.prisma.identity_verifications.findMany({
      where: { provider_profile_id: await this.profileOf(userId) },
      select: SELECT,
      orderBy: [{ created_at: 'desc' }, { identity_verification_id: 'desc' }],
    });

    const [actual, ...anteriores] = rows.map((r) => this.format(r));

    return { estado: actual?.estado ?? 'sin_enviar', actual: actual ?? null, anteriores };
  }

  /**
   * HU-55: queda pendiente (55.2), una pendiente a la vez (55.3) y una nueva tras un rechazo o una corrección (55.4).
   * Con la identidad ya verificada no se envía otra: la nueva quedaría como la más reciente y quitaría la insignia.
   */
  async submit(userId: bigint, dto: SubmitVerificationDto, files: Upload[] | undefined) {

    const profileId = await this.profileOf(userId);
    const count = files?.length ?? 0;

    if (!count) throw apiError(HttpStatus.BAD_REQUEST, 'PHOTOS_REQUIRED', 'Adjunta al menos una foto del documento.');

    if (count > MAX_VERIFICATION_PHOTOS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'VERIFICATION_PHOTOS', 'Puedes adjuntar máximo 5 fotos.');
    }

    const type = await this.prisma.document_types.findUnique({ where: { document_type_id: Number(dto.tipoDocumento) } });

    if (!type) throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_TYPE', 'Elige un tipo de documento de la lista.');

    // D-51: la cédula tiene de 6 a 10 dígitos (se aceptan puntos y espacios al escribirla)
    const number = type.type_name === 'cedula' ? dto.numero.replace(/[\s.]/g, '') : dto.numero;

    if (type.type_name === 'cedula' && !/^\d{6,10}$/.test(number)) {

      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_NUMBER', 'La cédula debe tener entre 6 y 10 dígitos.');
    }

    const latest = await this.prisma.identity_verifications.findFirst({
      where: { provider_profile_id: profileId },
      select: { verification_statuses: { select: { status_name: true } } },
      orderBy: [{ created_at: 'desc' }, { identity_verification_id: 'desc' }],
    });

    if (latest?.verification_statuses.status_name === 'pending') throw pendingExists();

    if (latest?.verification_statuses.status_name === 'approved') {

      throw apiError(HttpStatus.CONFLICT, 'ALREADY_VERIFIED', 'Tu identidad ya está verificada.');
    }

    const pending = await this.prisma.verification_statuses.findUniqueOrThrow({ where: { status_name: 'pending' } });
    const keys: string[] = [];

    try {

      // Se validan y suben una por una; si algo falla, se borran las que ya se subieron
      for (const file of files!) keys.push(await this.storage.uploadPrivatePhoto(IDENTITY_FOLDER, file));

      await this.prisma.$transaction(async (tx) => {

        const created = await tx.identity_verifications.create({
          data: {
            provider_profile_id: profileId,
            document_type_id: type.document_type_id,
            document_number: number,
            additional_info: dto.informacion ?? null,
            status_id: pending.verification_status_id,
            identity_verification_photos: { create: keys.map((photo_url) => ({ photo_url })) },
          },
          select: { identity_verification_id: true },
        });

        // HU-61: la solicitud queda en la trazabilidad, con quién y cuándo
        await tx.audit_events.create({
          data: {
            actor_id: userId,
            event_type: 'verification_submitted',
            entity_type: 'identity_verification',
            entity_id: created.identity_verification_id,
            new_state: 'pending',
          },
        });
      });

    } catch (err) {

      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw translateDbRule(err);
    }

    return this.mine(userId);
  }

  // ---------------------------------------------------------------- HU-58 administrador

  /** HU-58.1: las pendientes, de la más antigua a la más reciente. */
  async pending() {

    const rows = await this.prisma.identity_verifications.findMany({
      where: { verification_statuses: { status_name: 'pending' } },
      select: {
        ...SELECT,
        provider_profiles: {
          select: {
            users: { select: { first_name: true, last_name: true, profile_photo_url: true, id_number: true } },
            _count: { select: { identity_verifications: true } },
          },
        },
      },
      orderBy: [{ created_at: 'asc' }, { identity_verification_id: 'asc' }],
    });

    return rows.map((r) => {

      const { users, _count } = r.provider_profiles;
      const { id, tipoDocumento, numero, fotos, informacion, enviada } = this.format(r);

      return {
        id, tipoDocumento, numero, fotos, informacion, enviada,
        prestador: { nombre: `${users.first_name} ${users.last_name}`, fotoUrl: this.storage.publicUrl(users.profile_photo_url) },
        // Ayuda para revisar: la cédula con la que se registró (no se muestra, solo si coincide)
        coincideConRegistro: r.document_types.type_name === 'cedula' && users.id_number === r.document_number,
        anteriores: _count.identity_verifications - 1,
      };
    });
  }

  /** HU-58.2 a HU-58.4: aprobar, rechazar o pedir una corrección; queda quién y cuándo, y se avisa al prestador. */
  async review(adminId: bigint, verificationId: bigint, dto: ReviewVerificationDto) {

    const reason = dto.motivo ?? null;

    if (dto.decision !== 'aprobada' && !reason) {

      throw apiError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'Escribe el motivo para rechazar o pedir una corrección.');
    }

    return this.prisma.$transaction(async (tx) => {

      // Dos administradores no pueden revisar la misma solicitud a la vez
      await tx.$queryRaw`SELECT 1 FROM identity_verifications WHERE identity_verification_id = ${verificationId} FOR UPDATE`;

      const current = await tx.identity_verifications.findUnique({
        where: { identity_verification_id: verificationId },
        select: { verification_statuses: { select: { status_name: true } }, provider_profiles: { select: { user_id: true } } },
      });

      if (!current) throw new NotFoundException('La solicitud de verificación no existe.');

      const providerUserId = current.provider_profiles.user_id;

      if (providerUserId === adminId) throw new ForbiddenException('No puedes revisar tu propia verificación.');

      if (current.verification_statuses.status_name !== 'pending') {

        throw apiError(HttpStatus.CONFLICT, 'VERIFICATION_REVIEWED', 'Esta solicitud ya fue revisada; vuelve a cargar la lista.');
      }

      const status = await tx.verification_statuses.findUniqueOrThrow({ where: { status_name: STATUS_OF_DECISION[dto.decision] } });

      const updated = await tx.identity_verifications.update({
        where: { identity_verification_id: verificationId },
        data: { status_id: status.verification_status_id, reviewed_by: adminId, review_notes: reason },
        select: { updated_at: true },
      });

      // HU-61: el resultado queda en la trazabilidad, con el administrador
      await tx.audit_events.create({
        data: {
          actor_id: adminId,
          event_type: 'verification_reviewed',
          entity_type: 'identity_verification',
          entity_id: verificationId,
          previous_state: 'pending',
          new_state: STATUS_OF_DECISION[dto.decision],
        },
      });

      await this.notifications.notify([{
        userId: providerUserId,
        type: 'verification_result',
        message: RESULT_MESSAGE[dto.decision](reason),
      }], tx);

      return { id: String(verificationId), estado: dto.decision, revisada: updated.updated_at.toISOString() };
    });
  }

  // ---------------------------------------------------------------- auxiliares

  private async profileOf(userId: bigint) {

    const profile = await this.prisma.provider_profiles.findUnique({ where: { user_id: userId }, select: { provider_profile_id: true } });

    if (!profile) throw new NotFoundException('No tienes perfil de prestador.');

    return profile.provider_profile_id;
  }

  private format(r: Row) {

    return {
      id: String(r.identity_verification_id),
      tipoDocumento: {
        id: String(r.document_types.document_type_id),
        nombre: DOCUMENT_TYPE_LABEL[r.document_types.type_name] ?? r.document_types.type_name,
      },
      numero: r.document_number,
      fotos: r.identity_verification_photos.map((p) => this.storage.signedUrl(p.photo_url)!),
      informacion: r.additional_info,
      estado: STATE_OF[r.verification_statuses.status_name],
      enviada: r.created_at.toISOString(),
      // updated_at solo cambia con la revisión del administrador
      revisada: r.reviewed_by ? r.updated_at.toISOString() : null,
      motivo: r.review_notes,
    };
  }
}
