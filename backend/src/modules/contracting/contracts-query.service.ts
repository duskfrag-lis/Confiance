import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { BANK_VISIBLE_STATES, accountTypeKeyOf, blockKeyOf } from '../profiles/profiles.constants';
import {
  ADDRESS_VISIBLE_STATES, CANCEL_NOTICE_HOURS, DEADLINE_HOURS, FORCE_MAJEURE_STATES, MAX_RESCHEDULES, PAYMENT_ATTEMPT_STATES,
  PAYMENT_METHODS, RESCHEDULE_STATES, type ContractAction, type PaymentState, type RequestState,
} from './contracting.constants';

const HOUR = 3_600_000;

const PERSON = { first_name: true, last_name: true, profile_photo_url: true } satisfies Prisma.usersSelect;

const LIST_SELECT = {
  service_request_id: true,
  proposed_datetime: true,
  agreed_price: true,
  source_need_id: true,
  provider_profile_id: true,
  request_statuses: { select: { status_name: true } },
  provider_profiles: { select: { users: { select: PERSON } } },
  users: { select: PERSON },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
  appointments: { select: { scheduled_datetime: true } },
} satisfies Prisma.service_requestsSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  client_id: true,
  source_service_listing_id: true,
  exact_address: true,
  rejection_reason: true,
  created_at: true,
  completion_requested_at: true,
  provider_profiles: { select: { user_id: true, users: { select: PERSON } } },
  neighborhoods: { select: { neighborhood_id: true, neighborhood_name: true, communes: { select: { commune_id: true, commune_name: true } } } },
  cancellations: {
    select: {
      cancelled_by: true, reason: true, is_automatic: true, is_force_majeure: true, created_at: true,
      force_majeure_statuses: { select: { status_name: true } },
    },
  },
  appointment_reschedule_requests: {
    select: {
      requested_by: true, previous_datetime: true, new_datetime: true, created_at: true,
      reschedule_statuses: { select: { status_name: true } },
    },
    orderBy: { created_at: 'asc' },
  },
  completion_confirmations: { select: { confirmed_by: true, is_automatic: true, confirmed_at: true } },
  ratings: { select: { rated_by: true } },
  payments: {
    select: {
      amount: true, created_at: true, paid_at: true,
      payment_statuses: { select: { status_name: true } },
      payment_methods: { select: { method_name: true } },
    },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.service_requestsSelect;

type ListRow = Prisma.service_requestsGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.service_requestsGetPayload<{ select: typeof DETAIL_SELECT }>;
type Side = 'cliente' | 'prestador';

export interface ActionContext {
  side: Side;
  state: RequestState;
  /** Fecha de la cita o, si aún no existe, la propuesta (regla de implementación de HU-50). */
  scheduledAt: Date;
  /** Quién pidió el reagendamiento pendiente, si hay uno. */
  pendingRescheduleBy: Side | null;
  reschedules: number;
  clientConfirmedCompletion: boolean;
  payment: PaymentState | null;
  ratedByMe: boolean;
  now: number;
}

/**
 * HU-38.6: acciones permitidas para el estado y la parte. Siguen las reglas de cada HU (y de la base), así la
 * interfaz no ofrece algo que después fallaría.
 */
export function contractActions(c: ActionContext): ContractAction[] {

  const actions: ContractAction[] = [];
  const add = (action: ContractAction, when = true) => when && actions.push(action);
  const provider = c.side === 'prestador';
  const client = c.side === 'cliente';
  const cancellable = c.scheduledAt.getTime() - c.now > CANCEL_NOTICE_HOURS * HOUR;

  switch (c.state) {

    case 'solicitado':
      add('aceptar', provider);
      add('rechazar', provider);
      add('cancelar', cancellable);
      add('cancelar_fuerza_mayor');
      break;

    case 'aceptado':
    case 'confirmado':
      add('confirmar', client && c.state === 'aceptado');
      add('iniciar', provider && c.state === 'confirmado');
      // HU-50.2: con 24 h o menos no se cancela; se ofrece reagendar (HU-53.1, incluso en las últimas 24 h)
      add('cancelar', cancellable);
      add('cancelar_fuerza_mayor');
      add('reagendar', c.pendingRescheduleBy === null && c.reschedules < MAX_RESCHEDULES);
      add('responder_reagendamiento', c.pendingRescheduleBy !== null && c.pendingRescheduleBy !== c.side);
      break;

    case 'en_curso':
      add('finalizar', provider);
      add('cancelar_fuerza_mayor');
      break;

    case 'finalizado':
      add('confirmar_finalizacion', client && !c.clientConfirmedCompletion);
      add('pagar', client && c.payment === 'pendiente');
      add('confirmar_transferencia', provider && c.payment === 'pendiente_confirmacion');
      add('reportar');
      add('reclamar');
      break;

    case 'completado':
      add('calificar', !c.ratedByMe);
      add('reportar');
      add('reclamar');
      break;

    default:
      break;
  }

  return actions;
}

const fullName = (u: { first_name: string; last_name: string }) => `${u.first_name} ${u.last_name}`;
const titleOf = (r: ListRow) => r.service_listings?.title ?? r.needs?.title ?? 'Servicio';
const scheduledAt = (r: ListRow) => r.appointments?.scheduled_datetime ?? r.proposed_datetime;
const plusHours = (from: Date, hours: number) => new Date(from.getTime() + hours * HOUR).toISOString();

/**
 * HU-38 · Consulta de contratación (cliente o prestador) y HU-12 · historial del cliente. Solo las dos partes ven
 * una contratación (HU-38.7). Las etapas salen de la trazabilidad (audit_events, HU-61).
 */
@Injectable()
export class ContractsQueryService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /**
   * HU-12.1 y HU-12.2: las contrataciones del perfil activo, de la más reciente a la más antigua, con filtro
   * opcional por estado. El cliente ve al prestador y el prestador, al cliente.
   */
  async list(user: AuthUser, state?: RequestState) {

    const asClient = user.activeProfile === 'client';

    const rows = await this.prisma.service_requests.findMany({
      where: {
        ...(asClient ? { client_id: user.userId } : { provider_profiles: { user_id: user.userId } }),
        ...(state && { request_statuses: { status_name: state } }),
      },
      orderBy: [{ created_at: 'desc' }, { service_request_id: 'desc' }],
      select: LIST_SELECT,
    });

    return rows.map((r) => ({
      ...this.summary(r),
      ...(asClient ? { prestador: this.provider(r) } : { cliente: this.person(r.users) }),
    }));
  }

  /** HU-38 y HU-12.3/HU-12.4: el detalle según quién lo pide. A quien no es parte, 404 (HU-38.7). */
  async detail(userId: bigint, requestId: bigint) {

    const r = await this.prisma.service_requests.findUnique({ where: { service_request_id: requestId }, select: DETAIL_SELECT });

    const side: Side | null = r?.client_id === userId ? 'cliente' : r?.provider_profiles.user_id === userId ? 'prestador' : null;

    if (!r || !side) throw new NotFoundException('La contratación no existe.');

    const state = r.request_statuses.status_name as RequestState;
    const roleOf = (actor: bigint | null) =>
      actor === null ? 'sistema' : actor === r.client_id ? 'cliente' : actor === r.provider_profiles.user_id ? 'prestador' : 'administrador';

    const [events, bank, [block]] = await Promise.all([
      this.prisma.audit_events.findMany({
        where: { entity_type: 'service_request', entity_id: requestId, event_type: { in: ['request_created', 'request_status_changed'] } },
        orderBy: [{ occurred_at: 'asc' }, { audit_event_id: 'asc' }],
        select: { actor_id: true, previous_state: true, new_state: true, occurred_at: true },
      }),
      // HU-38.5 (según HU-18.2): el cliente ve los datos bancarios del prestador de ACEPTADO a FINALIZADO
      side === 'cliente' && BANK_VISIBLE_STATES.includes(state)
        ? this.prisma.provider_bank_accounts.findUnique({
          where: { provider_profile_id: r.provider_profile_id },
          select: { bank_name: true, account_number: true, bank_account_types: { select: { type_name: true } } },
        })
        : null,
      this.prisma.$queryRaw<{ block_name: string | null }[]>`
        SELECT tb.block_name FROM time_blocks tb WHERE tb.time_block_id = fn_local_block(${scheduledAt(r)}::timestamptz)`,
    ]);

    const pending = r.appointment_reschedule_requests.find((s) => s.reschedule_statuses.status_name === 'pending');
    const payment = this.payment(r, state);
    const acceptedAt = events.find((e) => e.new_state === 'aceptado')?.occurred_at;

    return {
      ...this.summary(r),
      rol: side,
      origen: r.source_need_id === null
        ? { tipo: 'publicacion' as const, id: String(r.source_service_listing_id) }
        : { tipo: 'necesidad' as const, id: String(r.source_need_id) },
      cliente: this.person(r.users),
      prestador: this.provider(r),
      bloque: block?.block_name ? blockKeyOf(block.block_name) : null,
      zona: {
        barrioId: String(r.neighborhoods.neighborhood_id),
        barrio: r.neighborhoods.neighborhood_name,
        comunaId: String(r.neighborhoods.communes.commune_id),
        comuna: r.neighborhoods.communes.commune_name,
      },
      // HU-38.2: el prestador ve la dirección exacta desde ACEPTADO
      direccion: side === 'cliente' || ADDRESS_VISIBLE_STATES.includes(state) ? r.exact_address : null,
      creada: r.created_at.toISOString(),
      plazo: this.deadline(r, state, acceptedAt),
      etapas: events.map((e) => ({
        estadoAnterior: e.previous_state,
        estado: e.new_state,
        fecha: e.occurred_at.toISOString(),
        actor: roleOf(e.actor_id),
      })),
      reagendamientos: r.appointment_reschedule_requests.map((s) => ({
        fechaAnterior: s.previous_datetime.toISOString(),
        fechaNueva: s.new_datetime.toISOString(),
        pedidoPor: roleOf(s.requested_by),
        estado: RESCHEDULE_STATES[s.reschedule_statuses.status_name],
        creado: s.created_at.toISOString(),
      })),
      finalizacion: r.completion_requested_at
        ? {
          solicitada: r.completion_requested_at.toISOString(),
          confirmacion: this.clientConfirmation(r),
        }
        : null,
      pago: payment,
      ...(side === 'cliente' && {
        datosBancarios: bank
          ? { banco: bank.bank_name, tipoCuenta: accountTypeKeyOf(bank.bank_account_types.type_name), numero: bank.account_number }
          : null,
      }),
      cierre: this.closing(r, state, roleOf),
      acciones: contractActions({
        side,
        state,
        scheduledAt: scheduledAt(r),
        pendingRescheduleBy: pending ? (roleOf(pending.requested_by) as Side) : null,
        reschedules: r.appointment_reschedule_requests.length,
        clientConfirmedCompletion: this.clientConfirmation(r) !== null,
        payment: payment?.estado ?? null,
        ratedByMe: r.ratings.some((x) => x.rated_by === userId),
        now: Date.now(),
      }),
    };
  }

  // ---------------------------------------------------------------- auxiliares

  private summary(r: ListRow) {

    return {
      id: String(r.service_request_id),
      servicio: titleOf(r),
      estado: r.request_statuses.status_name as RequestState,
      // Con cita, su fecha: solo cambia con un reagendamiento aceptado (HU-40.3)
      fechaHora: scheduledAt(r).toISOString(),
      valor: Number(r.agreed_price),
    };
  }

  private person(u: { first_name: string; last_name: string; profile_photo_url: string | null }) {

    return { nombre: fullName(u), fotoUrl: this.storage.publicUrl(u.profile_photo_url) };
  }

  private provider(r: ListRow) {

    return { id: String(r.provider_profile_id), ...this.person(r.provider_profiles.users) };
  }

  /** El plazo que corre en el estado actual, para que la interfaz no lo calcule con el reloj del navegador. */
  private deadline(r: DetailRow, state: RequestState, acceptedAt: Date | undefined) {

    if (state === 'solicitado') {

      return { tipo: 'respuesta_prestador' as const, hasta: plusHours(r.created_at, DEADLINE_HOURS.respuesta_prestador) };
    }

    if (state === 'aceptado' && acceptedAt) {

      return { tipo: 'confirmacion_cliente' as const, hasta: plusHours(acceptedAt, DEADLINE_HOURS.confirmacion_cliente) };
    }

    if (state === 'finalizado' && r.completion_requested_at && !this.clientConfirmation(r)) {

      return {
        tipo: 'confirmacion_finalizacion' as const,
        hasta: plusHours(r.completion_requested_at, DEADLINE_HOURS.confirmacion_finalizacion),
      };
    }

    return null;
  }

  private clientConfirmation(r: DetailRow) {

    const c = r.completion_confirmations.find((x) => x.confirmed_by === r.client_id);
    return c ? { fecha: c.confirmed_at.toISOString(), automatica: c.is_automatic } : null;
  }

  /**
   * HU-38.4 y HU-45: desde FINALIZADO, el estado del pago con su método y los intentos (también los PSE
   * rechazados, HU-45.3). Un PSE abierto sale como `en_proceso` para no ofrecer pagar otra vez.
   */
  private payment(r: DetailRow, state: RequestState) {

    if (state !== 'finalizado' && state !== 'completado') return null;

    const has = (status: string) => r.payments.find((p) => p.payment_statuses.status_name === status);
    const paid = has('paid');
    const marked = has('pending_confirmation');
    const open = has('pending');
    const current = paid ?? marked ?? open;

    const estado: PaymentState = paid ? 'pagado' : marked ? 'pendiente_confirmacion' : open ? 'en_proceso' : 'pendiente';

    return {
      estado,
      metodo: current ? PAYMENT_METHODS[current.payment_methods.method_name] ?? null : null,
      monto: Number(r.agreed_price),
      fecha: paid?.paid_at?.toISOString() ?? null,
      intentos: r.payments.map((p) => ({
        metodo: PAYMENT_METHODS[p.payment_methods.method_name] ?? null,
        estado: PAYMENT_ATTEMPT_STATES[p.payment_statuses.status_name],
        monto: Number(p.amount),
        fecha: p.created_at.toISOString(),
      })),
    };
  }

  /** HU-12.3: cómo terminó (completada, rechazada con su motivo o cancelada, por quién y por qué). */
  private closing(r: DetailRow, state: RequestState, roleOf: (actor: bigint | null) => string) {

    if (state === 'rechazado') return { tipo: 'rechazado' as const, motivo: r.rejection_reason };

    if (state === 'cancelado' && r.cancellations) {

      const c = r.cancellations;

      return {
        tipo: 'cancelado' as const,
        por: roleOf(c.cancelled_by),
        motivo: c.reason,
        automatica: c.is_automatic,
        fuerzaMayor: c.is_force_majeure
          ? { evaluacion: c.force_majeure_statuses ? FORCE_MAJEURE_STATES[c.force_majeure_statuses.status_name] : 'pendiente' }
          : null,
        fecha: c.created_at.toISOString(),
      };
    }

    if (state === 'completado') return { tipo: 'completado' as const };

    return null;
  }
}
