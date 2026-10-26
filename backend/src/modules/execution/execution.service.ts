import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REQUEST_SELECT, type RequestRow, dbRuleTranslator, fullName, lockRequest, moveTo, requestState, summaryOf, titleOf,
} from '../contracting/contract-tx';
import type { RequestState } from '../contracting/contracting.constants';
import { NotificationsService, type NewNotification } from '../notifications/notifications.service';
import type { ReportIssueDto } from './dto/execution.dto';

const completionConfirmed = () =>
  apiError(HttpStatus.CONFLICT, 'COMPLETION_CONFIRMED', 'Ya confirmaste la finalización de este servicio.');

const translateDbRule = dbRuleTranslator([
  ['Transición de estado no permitida', requestState],
  ['Solo se confirma la finalización de una contratación FINALIZADA', requestState],
  ['Solo se reporta un problema desde FINALIZADO', requestState],
]);

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * E9 · Ejecución: inicio (HU-46), finalización y su confirmación (HU-47) y reporte de problemas (HU-48). Las reglas
 * de estado, el inicio del plazo de 24 h y el paso a COMPLETADO (confirmación del cliente + pago, en cualquier
 * orden) están en la base; aquí se revisa quién y cuándo, y se avisa en la misma transacción.
 */
@Injectable()
export class ExecutionService {

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-46 prestador

  /** HU-46.1 y HU-46.2: CONFIRMADO → EN_CURSO, solo el prestador, y avisa al cliente. La cita pasa a en curso (HU-40). */
  async start(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'provider');

      if (request.request_statuses.status_name !== 'confirmado') throw requestState();

      await moveTo(tx, requestId, 'en_curso');

      await this.notifications.notify([{
        userId: request.client_id,
        type: 'service_started',
        message: `${fullName(request.provider_profiles.users)} inició el servicio "${titleOf(request)}".`,
        serviceRequestId: requestId,
      }], tx);

      return summaryOf(request, 'en_curso');
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- HU-47

  /**
   * HU-47.1: EN_CURSO → FINALIZADO, solo el prestador. La base guarda el inicio del plazo de 24 h
   * (completion_requested_at). Se pide al cliente que confirme y pague.
   */
  async finish(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'provider');

      if (request.request_statuses.status_name !== 'en_curso') throw requestState();

      await moveTo(tx, requestId, 'finalizado');

      await this.notifications.notify([{
        userId: request.client_id,
        type: 'completion_requested',
        message: `${fullName(request.provider_profiles.users)} marcó "${titleOf(request)}" como finalizado. Confirma la finalización `
          + 'en las próximas 24 horas (si no respondes, se confirma sola) y realiza el pago.',
        serviceRequestId: requestId,
      }], tx);

      return summaryOf(request, 'finalizado');
    }).catch((err) => { throw translateDbRule(err); });
  }

  /**
   * HU-47.2 y HU-47.6: el cliente confirma la finalización (manual) en FINALIZADO. Si el pago ya está en PAGADO, la
   * base pasa la contratación a COMPLETADO en el mismo momento (HU-47.5). Avisa al prestador.
   */
  async confirmCompletion(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'client');

      if (request.request_statuses.status_name !== 'finalizado') throw requestState();

      const already = await tx.completion_confirmations.count({ where: { service_request_id: requestId, confirmed_by: userId } });

      if (already) throw completionConfirmed();

      await tx.completion_confirmations.create({
        data: { service_request_id: requestId, confirmed_by: userId, is_automatic: false },
      });

      const state = await this.stateOf(tx, requestId);
      const title = titleOf(request);

      await this.notifications.notify([
        {
          userId: request.provider_profiles.user_id,
          type: 'completion_confirmed',
          message: `${fullName(request.users)} confirmó que el servicio "${title}" quedó listo.`,
          serviceRequestId: requestId,
        },
        ...(state === 'completado' ? this.completedNotices(request) : []),
      ], tx);

      return summaryOf(request, state);
    }).catch((err) => { throw isUniqueViolation(err) ? completionConfirmed() : translateDbRule(err); });
  }

  // ---------------------------------------------------------------- HU-48 las dos partes

  /**
   * HU-48: cualquiera de las partes reporta un problema en FINALIZADO o COMPLETADO; queda la contratación, quién y
   * cuándo (HU-48.3). Si es el cliente en FINALIZADO, la confirmación automática se detiene (HU-48.4): la consulta
   * de fn_auto_complete_service_requests excluye las que tienen un reporte del cliente.
   */
  async report(userId: bigint, requestId: bigint, dto: ReportIssueDto) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId);
      const state = request.request_statuses.status_name as RequestState;

      if (state !== 'finalizado' && state !== 'completado') throw requestState();

      await tx.issue_reports.create({
        data: { service_request_id: requestId, reported_by: userId, description: dto.descripcion },
      });

      return summaryOf(request, state);
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- sistema

  /**
   * HU-47.3 y HU-47.4: registra la confirmación automática del cliente a las 24 h de la finalización, salvo que el
   * cliente haya reportado un problema (regla en fn_auto_complete_service_requests). Avisa a las dos partes y, si ya
   * estaba pagada y quedó COMPLETADO, también eso. Devuelve cuántas confirmó.
   */
  async autoConfirm() {

    return this.prisma.$transaction(async (tx) => {

      const confirmed = await tx.$queryRaw<{ confirmed_request_id: bigint; completed: boolean }[]>`
        SELECT confirmed_request_id, completed FROM fn_auto_complete_service_requests()`;

      if (!confirmed.length) return 0;

      const requests = await tx.service_requests.findMany({
        where: { service_request_id: { in: confirmed.map((c) => c.confirmed_request_id) } },
        select: REQUEST_SELECT,
      });
      const byId = new Map(requests.map((r) => [r.service_request_id, r]));

      await this.notifications.notify(confirmed.flatMap(({ confirmed_request_id: id, completed }) => {

        const r = byId.get(id)!;
        const title = titleOf(r);

        return [
          {
            userId: r.client_id,
            type: 'completion_confirmed',
            message: `Se confirmó automáticamente la finalización de "${title}" porque pasaron 24 horas sin respuesta.`,
            serviceRequestId: id,
          },
          {
            userId: r.provider_profiles.user_id,
            type: 'completion_confirmed',
            message: `El cliente no respondió en 24 horas: la finalización de "${title}" quedó confirmada automáticamente.`,
            serviceRequestId: id,
          },
          ...(completed ? this.completedNotices(r) : []),
        ] satisfies NewNotification[];
      }), tx);

      return confirmed.length;
    });
  }

  /**
   * HU-46.3: si llegó la hora de la cita y la contratación sigue en CONFIRMADO, recuerda al prestador que marque el
   * inicio. Una sola vez por contratación. Devuelve cuántos recordatorios envió.
   */
  async remindStart() {

    const due = await this.prisma.service_requests.findMany({
      where: {
        request_statuses: { status_name: 'confirmado' },
        appointments: { scheduled_datetime: { lte: new Date() } },
        notifications: { none: { notification_types: { type_name: 'service_start_reminder' } } },
      },
      select: REQUEST_SELECT,
    });

    await this.notifications.notify(due.map((r) => ({
      userId: r.provider_profiles.user_id,
      type: 'service_start_reminder',
      message: `Ya es la hora de "${titleOf(r)}" con ${fullName(r.users)}. Cuando empieces, marca el inicio del servicio.`,
      serviceRequestId: r.service_request_id,
    })));

    return due.length;
  }

  // ---------------------------------------------------------------- auxiliares

  private async stateOf(tx: Prisma.TransactionClient, requestId: bigint) {

    const r = await tx.service_requests.findUniqueOrThrow({
      where: { service_request_id: requestId },
      select: { request_statuses: { select: { status_name: true } } },
    });

    return r.request_statuses.status_name as RequestState;
  }

  /** HU-47.5: las dos partes saben que la contratación quedó completada y que ya pueden calificar (HU-49). */
  private completedNotices(r: RequestRow): NewNotification[] {

    const title = titleOf(r);

    return [
      {
        userId: r.client_id,
        type: 'request_completed',
        message: `La contratación de "${title}" quedó completada. Ya puedes calificar a ${fullName(r.provider_profiles.users)}.`,
        serviceRequestId: r.service_request_id,
      },
      {
        userId: r.provider_profiles.user_id,
        type: 'request_completed',
        message: `La contratación de "${title}" quedó completada. Ya puedes calificar a ${fullName(r.users)}.`,
        serviceRequestId: r.service_request_id,
      },
    ];
  }
}
