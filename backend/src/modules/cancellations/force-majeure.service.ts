import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { fullName } from '../contracting/contract-tx';
import { NotificationsService } from '../notifications/notifications.service';
import type { ForceMajeureReviewDto } from './dto/cancellations.dto';

const PARTY = { first_name: true, last_name: true } satisfies Prisma.usersSelect;

const SELECT = {
  service_request_id: true,
  cancelled_by: true,
  reason: true,
  evidence_url: true,
  created_at: true,
  service_requests: {
    select: {
      client_id: true,
      proposed_datetime: true,
      users: { select: PARTY },
      provider_profiles: { select: { user_id: true, users: { select: PARTY } } },
      service_listings: { select: { title: true } },
      needs: { select: { title: true } },
    },
  },
} satisfies Prisma.cancellationsSelect;

const NOT_FOUND = 'No hay una cancelación por fuerza mayor en esta contratación.';

const RESULT_MESSAGE = {
  aprobada: (title: string) => `Revisamos tu cancelación por fuerza mayor de "${title}" y la aprobamos: queda constancia de que la causa era válida.`,
  rechazada: (title: string) => `Revisamos tu cancelación por fuerza mayor de "${title}" y no la aprobamos: queda constancia de que la causa no se consideró válida.`,
};

/**
 * HU-59 · Evaluación de fuerza mayor. La cancelación ya se aplicó al hacerla (HU-51); aquí el administrador deja
 * constancia de si la causa era válida, con su nombre y la fecha, y se avisa a quien canceló.
 */
@Injectable()
export class ForceMajeureService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  /** HU-59.1: las pendientes, de la más antigua a la más reciente, con su motivo y su evidencia (enlace firmado). */
  async pending() {

    const rows = await this.prisma.cancellations.findMany({
      where: { is_force_majeure: true, force_majeure_statuses: { status_name: 'pending' } },
      select: SELECT,
      orderBy: [{ created_at: 'asc' }, { cancellation_id: 'asc' }],
    });

    // El estado en que estaba la contratación al cancelarse, de la trazabilidad de la base
    const events = await this.prisma.audit_events.findMany({
      where: {
        entity_type: 'service_request',
        entity_id: { in: rows.map((r) => r.service_request_id) },
        new_state: 'cancelado',
      },
      select: { entity_id: true, previous_state: true },
    });
    const previous = new Map(events.map((e) => [e.entity_id, e.previous_state]));

    return rows.map((r) => {

      const sr = r.service_requests;
      const client = { nombre: fullName(sr.users), rol: 'cliente' as const };
      const provider = { nombre: fullName(sr.provider_profiles.users), rol: 'prestador' as const };
      const byClient = r.cancelled_by === sr.client_id;

      return {
        contratacionId: String(r.service_request_id),
        servicio: sr.service_listings?.title ?? sr.needs?.title ?? 'el servicio',
        canceladoPor: byClient ? client : provider,
        contraparte: byClient ? provider : client,
        motivo: r.reason,
        evidencia: r.evidence_url
          ? { nombre: `evidencia.${r.evidence_url.split('.').pop()}`, url: this.storage.signedUrl(r.evidence_url) }
          : null,
        cancelada: r.created_at.toISOString(),
        fechaServicio: sr.proposed_datetime.toISOString(),
        estadoAlCancelar: previous.get(r.service_request_id) ?? null,
      };
    });
  }

  /** HU-59.2 y HU-59.3: aprobada o rechazada; quedan el resultado, el administrador y la fecha, y se avisa. */
  async review(adminId: bigint, requestId: bigint, dto: ForceMajeureReviewDto) {

    return this.prisma.$transaction(async (tx) => {

      // Dos administradores no pueden evaluar la misma cancelación a la vez
      await tx.$queryRaw`SELECT 1 FROM cancellations WHERE service_request_id = ${requestId} FOR UPDATE`;

      const current = await tx.cancellations.findUnique({
        where: { service_request_id: requestId },
        select: {
          ...SELECT,
          cancellation_id: true,
          is_force_majeure: true,
          force_majeure_statuses: { select: { status_name: true } },
        },
      });

      if (!current?.is_force_majeure || current.cancelled_by === null) throw new NotFoundException(NOT_FOUND);

      const sr = current.service_requests;

      if (adminId === sr.client_id || adminId === sr.provider_profiles.user_id) {

        throw apiError(HttpStatus.FORBIDDEN, 'OWN_CANCELLATION', 'No puedes evaluar una contratación en la que eres parte.');
      }

      if (current.force_majeure_statuses?.status_name !== 'pending') {

        throw apiError(HttpStatus.CONFLICT, 'FORCE_MAJEURE_REVIEWED', 'Esta cancelación ya fue evaluada; vuelve a cargar la lista.');
      }

      const status = await tx.force_majeure_statuses.findUniqueOrThrow({
        where: { status_name: dto.decision === 'aprobada' ? 'approved' : 'rejected' },
      });

      const updated = await tx.cancellations.update({
        where: { service_request_id: requestId },
        data: {
          force_majeure_status_id: status.force_majeure_status_id,
          force_majeure_reviewed_by: adminId,
          force_majeure_reviewed_at: new Date(),
        },
        select: { force_majeure_reviewed_at: true },
      });

      // HU-61: la evaluación queda en la trazabilidad, con el administrador
      await tx.audit_events.create({
        data: {
          actor_id: adminId,
          event_type: 'force_majeure_reviewed',
          entity_type: 'cancellation',
          entity_id: current.cancellation_id,
          previous_state: 'pending',
          new_state: status.status_name,
        },
      });

      await this.notifications.notify([{
        userId: current.cancelled_by,
        type: 'force_majeure_result',
        message: RESULT_MESSAGE[dto.decision](sr.service_listings?.title ?? sr.needs?.title ?? 'el servicio'),
        serviceRequestId: requestId,
      }], tx);

      return { contratacionId: String(requestId), evaluacion: dto.decision, fecha: updated.force_majeure_reviewed_at!.toISOString() };
    });
  }
}
