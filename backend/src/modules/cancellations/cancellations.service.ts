import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  type RequestRow, type Side, dbRuleTranslator, fullName, lockRequest, requestState, summaryOf, titleOf,
} from '../contracting/contract-tx';
import { CANCEL_NOTICE_HOURS, MAX_RESCHEDULES, type RequestState } from '../contracting/contracting.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { FORCE_MAJEURE_FOLDER, bogotaDateTime } from './cancellations.constants';
import type { CancelContractDto, RescheduleDto, RespondRescheduleDto } from './dto/cancellations.dto';

const HOUR = 3_600_000;

const ORDINARY_STATES: RequestState[] = ['solicitado', 'aceptado', 'confirmado'];
/** HU-51.1 y HU-51.2: hasta EN_CURSO. La base admite también FINALIZADO, pero la V7 lo excluye (va por reclamo). */
const FORCE_MAJEURE_STATES: RequestState[] = [...ORDINARY_STATES, 'en_curso'];
const RESCHEDULE_STATES: RequestState[] = ['aceptado', 'confirmado'];

const cancelNotice = () =>
  apiError(HttpStatus.CONFLICT, 'CANCEL_NOTICE', 'Faltan 24 horas o menos para la cita: ya no se puede cancelar, solo reagendar o cancelar por fuerza mayor.');
const pastDate = () => apiError(HttpStatus.CONFLICT, 'PAST_DATE', 'Esa fecha y hora ya pasaron. Elige otra.');
const outsideAvailability = () =>
  apiError(HttpStatus.BAD_REQUEST, 'OUTSIDE_AVAILABILITY', 'Ese horario está fuera de la disponibilidad del prestador.');
const slotTaken = () =>
  apiError(HttpStatus.CONFLICT, 'SLOT_TAKEN', 'El prestador ya tiene una contratación en ese día y bloque horario. Elige otro horario.');
const reschedulePending = () =>
  apiError(HttpStatus.CONFLICT, 'RESCHEDULE_PENDING', 'Ya hay una propuesta de horario pendiente: espera la respuesta.');
const rescheduleLimit = () =>
  apiError(HttpStatus.CONFLICT, 'RESCHEDULE_LIMIT', 'Ya se hicieron las 2 solicitudes de reagendamiento que permite una contratación.');

/** Las mismas reglas están en la base (fn_prevent_late_cancellation, fn_check_reschedule_limit…): por si dos operaciones se cruzan. */
const translateDbRule = dbRuleTranslator([
  ['solo se permite hasta 24h', cancelNotice],
  ['Solo se puede cancelar', requestState],
  ['Solo se puede reagendar', requestState],
  ['ya no admite reagendamiento', requestState],
  ['ya fue respondida', requestState],
  ['Transición de estado no permitida', requestState],
  ['Ya hay una solicitud de reagendamiento pendiente', reschedulePending],
  ['Máximo de 2', rescheduleLimit],
  ['fuera de la disponibilidad del prestador', outsideAvailability],
  ['fuera de los bloques horarios', outsideAvailability],
  ['ya tiene una contratación aceptada en ese día y bloque', slotTaken],
  ['debe ser futura', pastDate],
]);

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

type UploadedFile = { buffer: Buffer; size: number };

/**
 * E11 · Cancelación ordinaria (HU-50), por fuerza mayor (HU-51) y reagendamiento (HU-53). La cancelación automática
 * (HU-52) está en la E5 (ContractsScheduler). La base aplica cada cancelación (pasa a CANCELADO, libera el horario,
 * reabre la necesidad) y cada reagendamiento aceptado (mueve la cita); aquí se revisa quién, cuándo y se avisa.
 */
@Injectable()
export class CancellationsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-50 y HU-51

  /**
   * HU-50: ordinaria en SOLICITADO, ACEPTADO o CONFIRMADO, hasta 24 h antes de la cita (o de la fecha propuesta si
   * aún no hay cita). HU-51: por fuerza mayor también en EN_CURSO, sin las 24 h, con evidencia opcional y la
   * evaluación en "pendiente" (HU-59). Queda el actor, el motivo y la fecha (HU-50.5); se avisa a la otra parte.
   */
  async cancel(userId: bigint, requestId: bigint, dto: CancelContractDto, evidence?: UploadedFile) {

    const forceMajeure = dto.fuerzaMayor ?? false;

    if (evidence && !forceMajeure) {

      throw apiError(HttpStatus.BAD_REQUEST, 'EVIDENCE_NOT_ALLOWED', 'La evidencia solo se adjunta en una cancelación por fuerza mayor.');
    }

    const evidenceKey = evidence ? await this.storage.uploadPrivateEvidence(FORCE_MAJEURE_FOLDER, evidence) : null;

    try {

      return await this.prisma.$transaction(async (tx) => {

        const { request, side } = await lockRequest(tx, userId, requestId);
        const state = request.request_statuses.status_name as RequestState;

        if (!(forceMajeure ? FORCE_MAJEURE_STATES : ORDINARY_STATES).includes(state)) throw requestState();

        if (!forceMajeure && (await this.scheduledAt(tx, request)).getTime() - Date.now() <= CANCEL_NOTICE_HOURS * HOUR) {

          throw cancelNotice();
        }

        const pending = forceMajeure
          ? await tx.force_majeure_statuses.findUniqueOrThrow({ where: { status_name: 'pending' } })
          : null;

        await tx.cancellations.create({
          data: {
            service_request_id: requestId,
            cancelled_by: userId,
            reason: dto.motivo,
            is_force_majeure: forceMajeure,
            evidence_url: evidenceKey,
            force_majeure_status_id: pending?.force_majeure_status_id ?? null,
          },
        });

        await this.notifications.notify([{
          userId: this.otherUser(request, side),
          type: 'request_cancelled',
          message: `${this.nameOf(request, side)} canceló la contratación de "${titleOf(request)}"`
            + `${forceMajeure ? ' por fuerza mayor (un administrador evaluará la causa)' : ''}. Motivo: ${dto.motivo}`
            + (side === 'provider' && request.source_need_id !== null ? ' Tu necesidad volvió a quedar abierta.' : ''),
          serviceRequestId: requestId,
        }], tx);

        return summaryOf(request, 'cancelado');
      });
    } catch (err) {

      if (evidenceKey) await this.storage.remove(evidenceKey);
      throw isUniqueViolation(err) ? requestState() : translateDbRule(err);
    }
  }

  // ---------------------------------------------------------------- HU-53

  /**
   * HU-53.1 y HU-53.2: cualquiera de las partes propone un horario en ACEPTADO o CONFIRMADO (también dentro de las
   * últimas 24 h): futuro, distinto del actual, dentro de la disponibilidad del prestador y sin chocar con otra
   * contratación. Una pendiente a la vez y máximo 2 por contratación (HU-53.4). Se avisa a la otra parte (HU-53.6).
   */
  async reschedule(userId: bigint, requestId: bigint, dto: RescheduleDto) {

    const at = new Date(dto.fechaHora);

    if (at.getTime() <= Date.now()) throw pastDate();

    return this.prisma.$transaction(async (tx) => {

      const { request, side } = await lockRequest(tx, userId, requestId);
      const state = request.request_statuses.status_name as RequestState;

      if (!RESCHEDULE_STATES.includes(state)) throw requestState();

      const current = await this.scheduledAt(tx, request);

      if (current.getTime() === at.getTime()) {

        throw apiError(HttpStatus.BAD_REQUEST, 'SAME_DATE', 'Elige un horario distinto al actual.');
      }

      const requests = await tx.appointment_reschedule_requests.findMany({
        where: { service_request_id: requestId },
        select: { reschedule_statuses: { select: { status_name: true } } },
      });

      if (requests.some((r) => r.reschedule_statuses.status_name === 'pending')) throw reschedulePending();
      if (requests.length >= MAX_RESCHEDULES) throw rescheduleLimit();

      const pending = await tx.reschedule_statuses.findUniqueOrThrow({ where: { status_name: 'pending' } });

      // La cita y la fecha anterior las fija la base (fn_check_reschedule_limit), junto con la disponibilidad y el choque
      await tx.appointment_reschedule_requests.create({
        data: {
          service_request_id: requestId,
          requested_by: userId,
          previous_datetime: current,
          new_datetime: at,
          status_id: pending.reschedule_status_id,
        },
      });

      await this.notifications.notify([{
        userId: this.otherUser(request, side),
        type: 'reschedule_requested',
        message: `${this.nameOf(request, side)} propone cambiar "${titleOf(request)}" para el ${bogotaDateTime.format(at)}: acéptalo o recházalo.`,
        serviceRequestId: requestId,
      }], tx);

      return { ...summaryOf(request, state), fechaHora: current.toISOString() };
    }).catch((err) => { throw translateDbRule(err); });
  }

  /**
   * HU-53.3: la otra parte (no quien la pidió) acepta o rechaza la propuesta pendiente. Si acepta, la base mueve la
   * cita (o la fecha propuesta si aún no hay cita) y revisa otra vez que el bloque siga libre; si rechaza, se mantiene
   * la anterior. El historial queda en appointment_reschedule_requests (HU-53.5). Se avisa a quien la pidió.
   */
  async respond(userId: bigint, requestId: bigint, dto: RespondRescheduleDto) {

    return this.prisma.$transaction(async (tx) => {

      const { request, side } = await lockRequest(tx, userId, requestId);
      const state = request.request_statuses.status_name as RequestState;

      if (!RESCHEDULE_STATES.includes(state)) throw requestState();

      const proposal = await tx.appointment_reschedule_requests.findFirst({
        where: { service_request_id: requestId, reschedule_statuses: { status_name: 'pending' } },
      });

      if (!proposal) throw apiError(HttpStatus.CONFLICT, 'RESCHEDULE_NONE', 'No hay una propuesta de horario pendiente.');

      if (proposal.requested_by === userId) {

        throw apiError(HttpStatus.CONFLICT, 'RESCHEDULE_OWN', 'La propuesta es tuya: la debe responder la otra parte.');
      }

      if (dto.aceptar && proposal.new_datetime.getTime() <= Date.now()) throw pastDate();

      const status = await tx.reschedule_statuses.findUniqueOrThrow({ where: { status_name: dto.aceptar ? 'accepted' : 'rejected' } });

      await tx.appointment_reschedule_requests.update({
        where: { reschedule_request_id: proposal.reschedule_request_id },
        data: { status_id: status.reschedule_status_id },
      });

      const date = dto.aceptar ? proposal.new_datetime : proposal.previous_datetime;

      await this.notifications.notify([{
        userId: proposal.requested_by,
        type: 'reschedule_answered',
        message: dto.aceptar
          ? `${this.nameOf(request, side)} aceptó el nuevo horario de "${titleOf(request)}": queda para el ${bogotaDateTime.format(date)}`
          : `${this.nameOf(request, side)} rechazó el nuevo horario de "${titleOf(request)}". Se mantiene el ${bogotaDateTime.format(date)}`,
        serviceRequestId: requestId,
      }], tx);

      return { ...summaryOf(request, state), fechaHora: date.toISOString() };
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- auxiliares

  /** Con cita, su fecha (cambia solo con un reagendamiento aceptado); sin cita, la fecha propuesta (HU-50, regla). */
  private async scheduledAt(tx: Prisma.TransactionClient, request: RequestRow) {

    const appointment = await tx.appointments.findUnique({
      where: { service_request_id: request.service_request_id },
      select: { scheduled_datetime: true },
    });

    return appointment?.scheduled_datetime ?? request.proposed_datetime;
  }

  private otherUser(request: RequestRow, side: Side) {

    return side === 'client' ? request.provider_profiles.user_id : request.client_id;
  }

  private nameOf(request: RequestRow, side: Side) {

    return fullName(side === 'client' ? request.users : request.provider_profiles.users);
  }
}
