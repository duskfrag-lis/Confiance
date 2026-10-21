import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService, type NewNotification } from '../notifications/notifications.service';
import { blockKeyOf } from '../profiles/profiles.constants';
import { LISTING_STATES } from '../publications/publications.constants';
import type { CreateContractDto, RejectContractDto } from './dto/contracting.dto';
import { SLOT_DAYS, type RequestState } from './contracting.constants';

const REQUEST_SELECT = {
  service_request_id: true,
  client_id: true,
  provider_profile_id: true,
  source_need_id: true,
  proposed_datetime: true,
  agreed_price: true,
  request_statuses: { select: { status_name: true } },
  provider_profiles: { select: { user_id: true, users: { select: { first_name: true, last_name: true } } } },
  users: { select: { first_name: true, last_name: true } },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
} satisfies Prisma.service_requestsSelect;

type RequestRow = Prisma.service_requestsGetPayload<{ select: typeof REQUEST_SELECT }>;

interface SlotRow {
  fecha: string;
  block_name: string;
  inicio: string;
  fin: string;
}

interface SlotCheck {
  in_block: boolean;
  available: boolean;
  taken: boolean;
}

const LISTING_UNAVAILABLE = 'La publicación no existe o ya no está disponible.';
const NOT_FOUND = 'La contratación no existe.';

const slotTaken = () =>
  apiError(HttpStatus.CONFLICT, 'SLOT_TAKEN', 'El prestador ya tiene una contratación en ese día y bloque horario. Elige otro horario.');
const outsideAvailability = () =>
  apiError(HttpStatus.BAD_REQUEST, 'OUTSIDE_AVAILABILITY', 'Ese horario está fuera de la disponibilidad del prestador.');
const pastDate = () => apiError(HttpStatus.CONFLICT, 'PAST_DATE', 'La fecha y hora de la contratación ya pasaron.');
const requestState = () => apiError(HttpStatus.CONFLICT, 'REQUEST_STATE', 'Esta contratación cambió de estado; vuelve a cargarla.');

/**
 * Las reglas también están en la base (triggers de service_requests). Si dos operaciones se cruzan después de la
 * revisión del servicio, la base las frena con una excepción; aquí se traduce al mismo error legible.
 */
const DB_RULES: [string, () => HttpException][] = [
  ['ya tiene una contratación aceptada en ese día y bloque', slotTaken],
  ['fuera de la disponibilidad del prestador', outsideAvailability],
  ['fuera de los bloques horarios', outsideAvailability],
  ['no está activa', () => new NotFoundException(LISTING_UNAVAILABLE)],
  ['debe ser futura', pastDate],
  ['Transición de estado no permitida', requestState],
];

const translateDbRule = (err: unknown) => {

  if (err instanceof HttpException || !(err instanceof Error)) return err;
  const rule = DB_RULES.find(([fragment]) => err.message.includes(fragment));
  return rule ? rule[1]() : err;
};

const fullName = (u: { first_name: string; last_name: string }) => `${u.first_name} ${u.last_name}`;
const titleOf = (r: RequestRow) => r.service_listings?.title ?? r.needs?.title ?? 'el servicio';

/**
 * E5 · Contratación: iniciar la solicitud (HU-34), aceptarla o rechazarla (HU-36) y confirmarla (HU-37). El origen,
 * las partes y la trazabilidad de cada cambio (HU-35) los garantiza la base: cada transacción fija `app.user_id`
 * para que los triggers registren quién hizo el cambio en audit_events. Los avisos se guardan en la misma
 * transacción que el cambio.
 */
@Injectable()
export class ContractsService {

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-34 cliente

  /**
   * Lo que necesita el formulario de solicitud: la publicación con su rango de precio como referencia (HU-34.5),
   * la zona y dirección de referencia del cliente para rellenarlas, y los bloques libres del prestador en los
   * próximos días (HU-34.4, HU-39.2). Un bloque de hoy que ya terminó no se ofrece.
   */
  async prepare(userId: bigint, listingId: bigint) {

    const listing = await this.activeListing(userId, listingId);

    const [client, slots] = await Promise.all([
      this.prisma.client_profiles.findUnique({
        where: { user_id: userId },
        select: {
          reference_address: true,
          neighborhoods: { select: { neighborhood_id: true, neighborhood_name: true, communes: { select: { commune_id: true, commune_name: true } } } },
        },
      }),
      this.prisma.$queryRaw<SlotRow[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS fecha, tb.block_name,
               to_char(tb.start_time, 'HH24:MI') AS inicio, to_char(tb.end_time, 'HH24:MI') AS fin
        FROM generate_series(
               (now() AT TIME ZONE 'America/Bogota')::date,
               (now() AT TIME ZONE 'America/Bogota')::date + ${SLOT_DAYS - 1}::int,
               INTERVAL '1 day') AS d
        JOIN days_of_week dw ON dw.day_name = to_char(d, 'FMday')
        JOIN provider_availability pa ON pa.day_of_week_id = dw.day_of_week_id
                                     AND pa.provider_profile_id = ${listing.provider_profile_id}
        JOIN time_blocks tb ON tb.time_block_id = pa.time_block_id
        WHERE (d::date + tb.end_time) AT TIME ZONE 'America/Bogota' > now()
          AND NOT fn_provider_slot_taken(${listing.provider_profile_id}, (d::date + tb.start_time) AT TIME ZONE 'America/Bogota', NULL)
        ORDER BY d, tb.start_time`,
    ]);

    const zone = client?.neighborhoods;

    return {
      publicacion: {
        id: String(listing.service_listing_id),
        titulo: listing.title,
        precioMin: Number(listing.min_price),
        precioMax: Number(listing.max_price),
        precioFijo: Number(listing.min_price) === Number(listing.max_price),
      },
      prestador: { id: String(listing.provider_profile_id), nombre: fullName(listing.provider_profiles.users) },
      zona: zone
        ? {
          barrioId: String(zone.neighborhood_id),
          barrio: zone.neighborhood_name,
          comunaId: String(zone.communes.commune_id),
          comuna: zone.communes.commune_name,
        }
        : null,
      direccion: client?.reference_address ?? null,
      horarios: slots.map((s) => ({ fecha: s.fecha, bloque: blockKeyOf(s.block_name), inicio: s.inicio, fin: s.fin })),
    };
  }

  /**
   * HU-34: crea la solicitud en SOLICITADO desde una publicación activa y avisa al prestador (HU-34.6). La fecha
   * debe ser futura y estar en un bloque configurado y libre del prestador (HU-34.4): en SOLICITADO no se bloquea
   * (HU-39.3), pero una solicitud en un bloque ya ocupado no se podría aceptar.
   */
  async create(userId: bigint, dto: CreateContractDto) {

    const listing = await this.activeListing(userId, BigInt(dto.publicacionId));
    await this.assertNeighborhood(Number(dto.barrioId));

    const at = new Date(dto.fechaHora);

    if (at.getTime() <= Date.now()) {

      throw apiError(HttpStatus.BAD_REQUEST, 'PAST_DATE', 'La fecha y hora deben ser futuras.');
    }

    const [slot] = await this.prisma.$queryRaw<SlotCheck[]>`
      SELECT fn_local_block(ts) IS NOT NULL AS in_block,
             EXISTS (SELECT 1 FROM provider_availability
                     WHERE provider_profile_id = ${listing.provider_profile_id}
                       AND day_of_week_id = fn_local_day(ts)
                       AND time_block_id = fn_local_block(ts)) AS available,
             fn_provider_slot_taken(${listing.provider_profile_id}, ts, NULL) AS taken
      FROM (SELECT ${at}::timestamptz AS ts) AS x`;

    if (!slot.in_block || !slot.available) throw outsideAvailability();
    if (slot.taken) throw slotTaken();

    return this.prisma.$transaction(async (tx) => {

      await this.setActor(tx, userId);

      const requested = await tx.request_statuses.findUniqueOrThrow({ where: { status_name: 'solicitado' } });

      const request = await tx.service_requests.create({
        data: {
          client_id: userId,
          provider_profile_id: listing.provider_profile_id,
          source_service_listing_id: listing.service_listing_id,
          proposed_datetime: at,
          neighborhood_id: Number(dto.barrioId),
          exact_address: dto.direccion,
          agreed_price: dto.valor,
          status_id: requested.request_status_id,
        },
        select: REQUEST_SELECT,
      });

      await this.notifications.notify([{
        userId: listing.provider_profiles.user_id,
        type: 'request_received',
        message: `${fullName(request.users)} te envió una solicitud para "${listing.title}". Acéptala o recházala en las próximas 48 horas.`,
        serviceRequestId: request.service_request_id,
      }], tx);

      return this.summary(request, 'solicitado');
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- HU-36 prestador

  /**
   * HU-36.1: SOLICITADO → ACEPTADO. Desde aquí el bloque queda ocupado; la base serializa las aceptaciones del
   * mismo prestador (HU-39). No se acepta con el bloque ocupado ni con la fecha pasada (HU-36.2). Avisa al cliente.
   */
  async accept(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const request = await this.lockOwn(tx, userId, requestId, 'provider');

      if (request.request_statuses.status_name !== 'solicitado') throw requestState();
      if (request.proposed_datetime.getTime() <= Date.now()) throw pastDate();

      const [{ taken }] = await tx.$queryRaw<{ taken: boolean }[]>`
        SELECT fn_provider_slot_taken(${request.provider_profile_id}, ${request.proposed_datetime}::timestamptz, ${requestId}) AS taken`;

      if (taken) throw slotTaken();

      await this.moveTo(tx, requestId, 'aceptado');

      await this.notifications.notify([{
        userId: request.client_id,
        type: 'request_accepted',
        message: `${fullName(request.provider_profiles.users)} aceptó tu solicitud de "${titleOf(request)}". Confírmala en las próximas 24 horas.`,
        serviceRequestId: requestId,
      }], tx);

      return this.summary(request, 'aceptado');
    }).catch((err) => { throw translateDbRule(err); });
  }

  /**
   * HU-36.3: SOLICITADO → RECHAZADO, con motivo opcional, y avisa al cliente (HU-36.4). Si la solicitud venía de
   * una necesidad, la base la vuelve a abrir (migración necesidad_reabre).
   */
  async reject(userId: bigint, requestId: bigint, dto: RejectContractDto) {

    return this.prisma.$transaction(async (tx) => {

      const request = await this.lockOwn(tx, userId, requestId, 'provider');

      if (request.request_statuses.status_name !== 'solicitado') throw requestState();

      await this.moveTo(tx, requestId, 'rechazado', { rejection_reason: dto.motivo ?? null });

      const reason = dto.motivo ? ` Motivo: ${dto.motivo}` : '';

      await this.notifications.notify([{
        userId: request.client_id,
        type: 'request_rejected',
        message: `${fullName(request.provider_profiles.users)} rechazó tu solicitud de "${titleOf(request)}".${this.needNote(request)}${reason}`,
        serviceRequestId: requestId,
      }], tx);

      return this.summary(request, 'rechazado');
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- HU-37 cliente

  /**
   * HU-37.2: ACEPTADO → CONFIRMADO. La base genera la cita (HU-40) y registra quién confirmó y cuándo (HU-37.3).
   * No depende del pago (HU-37.4). Avisa a las dos partes.
   */
  async confirm(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const request = await this.lockOwn(tx, userId, requestId, 'client');

      if (request.request_statuses.status_name !== 'aceptado') throw requestState();
      if (request.proposed_datetime.getTime() <= Date.now()) throw pastDate();

      await this.moveTo(tx, requestId, 'confirmado');

      const title = titleOf(request);

      await this.notifications.notify([
        {
          userId: request.provider_profiles.user_id,
          type: 'request_confirmed',
          message: `${fullName(request.users)} confirmó la contratación de "${title}". Ya está en tu agenda.`,
          serviceRequestId: requestId,
        },
        {
          userId: request.client_id,
          type: 'request_confirmed',
          message: `Confirmaste la contratación de "${title}" con ${fullName(request.provider_profiles.users)}. Ya está en tu agenda.`,
          serviceRequestId: requestId,
        },
      ], tx);

      return this.summary(request, 'confirmado');
    }).catch((err) => { throw translateDbRule(err); });
  }

  // ---------------------------------------------------------------- HU-52 sistema

  /**
   * HU-36.5 y HU-37.5: cancela las solicitudes sin respuesta en 48 h y las aceptadas sin confirmar en 24 h (la
   * regla está en fn_auto_cancel_stale_requests) y avisa a las dos partes. Devuelve cuántas canceló.
   */
  async autoCancelStale() {

    return this.prisma.$transaction(async (tx) => {

      const cancelled = await tx.$queryRaw<{ cancelled_request_id: bigint; previous_state: string }[]>`
        SELECT cancelled_request_id, previous_state FROM fn_auto_cancel_stale_requests()`;

      if (!cancelled.length) return 0;

      const requests = await tx.service_requests.findMany({
        where: { service_request_id: { in: cancelled.map((c) => c.cancelled_request_id) } },
        select: REQUEST_SELECT,
      });
      const byId = new Map(requests.map((r) => [r.service_request_id, r]));

      await this.notifications.notify(cancelled.flatMap(({ cancelled_request_id: id, previous_state: state }) => {

        const r = byId.get(id)!;
        const title = titleOf(r);
        const unanswered = state === 'solicitado';

        return [
          {
            userId: r.client_id,
            type: 'request_auto_cancelled',
            message: unanswered
              ? `Se canceló tu solicitud de "${title}": ${fullName(r.provider_profiles.users)} no respondió en 48 horas.${this.needNote(r)}`
              : `Se canceló la contratación de "${title}" porque no la confirmaste en 24 horas.${this.needNote(r)}`,
            serviceRequestId: id,
          },
          {
            userId: r.provider_profiles.user_id,
            type: 'request_auto_cancelled',
            message: unanswered
              ? `Se canceló la solicitud de "${title}" porque no respondiste en 48 horas.`
              : `Se canceló la contratación de "${title}": el cliente no la confirmó en 24 horas.`,
            serviceRequestId: id,
          },
        ] satisfies NewNotification[];
      }), tx);

      return cancelled.length;
    });
  }

  // ---------------------------------------------------------------- auxiliares

  /**
   * HU-34.1 y HU-34.7: publicación activa de una cuenta no deshabilitada, y ajena (nadie se contrata a sí mismo;
   * la base también lo impide).
   */
  private async activeListing(userId: bigint, listingId: bigint) {

    const listing = await this.prisma.service_listings.findFirst({
      where: {
        service_listing_id: listingId,
        listing_statuses: { status_name: LISTING_STATES.activo },
        provider_profiles: { users: { account_statuses: { status_name: { not: 'disabled' } } } },
      },
      select: {
        service_listing_id: true,
        title: true,
        min_price: true,
        max_price: true,
        provider_profile_id: true,
        provider_profiles: { select: { user_id: true, users: { select: { first_name: true, last_name: true } } } },
      },
    });

    if (!listing) throw new NotFoundException(LISTING_UNAVAILABLE);

    if (listing.provider_profiles.user_id === userId) {

      throw apiError(HttpStatus.CONFLICT, 'SELF_HIRE', 'No puedes contratar tus propios servicios.');
    }

    return listing;
  }

  private async assertNeighborhood(id: number) {

    const found = await this.prisma.neighborhoods.count({
      where: { neighborhood_id: id, is_active: true, communes: { is_active: true } },
    });

    if (!found) throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_ZONE', 'El barrio no existe o no está disponible.');
  }

  /**
   * Bloquea la contratación para que dos respuestas simultáneas no se crucen y la devuelve si es de esta parte.
   * A quien no es parte se le responde 404, sin revelar que existe (HU-38.7).
   */
  private async lockOwn(tx: Prisma.TransactionClient, userId: bigint, requestId: bigint, side: 'client' | 'provider') {

    await this.setActor(tx, userId);
    await tx.$queryRaw`SELECT 1 FROM service_requests WHERE service_request_id = ${requestId} FOR UPDATE`;

    const request = await tx.service_requests.findUnique({ where: { service_request_id: requestId }, select: REQUEST_SELECT });
    const owner = side === 'client' ? request?.client_id : request?.provider_profiles.user_id;

    if (!request || owner !== userId) throw new NotFoundException(NOT_FOUND);

    return request;
  }

  private async moveTo(tx: Prisma.TransactionClient, requestId: bigint, state: RequestState, data: Prisma.service_requestsUpdateInput = {}) {

    const status = await tx.request_statuses.findUniqueOrThrow({ where: { status_name: state } });

    await tx.service_requests.update({
      where: { service_request_id: requestId },
      data: { ...data, request_statuses: { connect: { request_status_id: status.request_status_id } } },
    });
  }

  /** Actor de la trazabilidad (audit_events) que escriben los triggers de la solicitud (HU-35.5). */
  private async setActor(tx: Prisma.TransactionClient, userId: bigint) {

    await tx.$queryRaw`SELECT set_config('app.user_id', ${String(userId)}, true)`;
  }

  private needNote(r: RequestRow) {

    return r.source_need_id === null ? '' : ' Tu necesidad volvió a quedar abierta para elegir a otro interesado.';
  }

  private summary(r: RequestRow, state: RequestState) {

    return {
      id: String(r.service_request_id),
      estado: state,
      fechaHora: r.proposed_datetime.toISOString(),
      valor: Number(r.agreed_price),
    };
  }
}
