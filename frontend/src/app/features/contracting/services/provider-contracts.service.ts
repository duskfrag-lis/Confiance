import { Injectable, Signal, computed, signal } from '@angular/core';
import { bogotaDate, bogotaParts } from '../../../shared/utils/format';
import {
  Actor,
  Contract,
  ContractEvent,
  ContractParty,
  ContractStatus,
  MAX_RESCHEDULES,
  PaymentAttempt,
  TimeBlock,
  paymentStatus,
} from '../models/contract';

const HOUR = 3_600_000;

export const BLOCK_HOURS: Record<TimeBlock, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 22],
};

export const BLOCK_LABEL: Record<TimeBlock, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
};

export function blockOf(date: Date): TimeBlock | null {
  const hour = Number(
    new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(date),
  );
  return (Object.keys(BLOCK_HOURS) as TimeBlock[]).find((b) => hour >= BLOCK_HOURS[b][0] && hour < BLOCK_HOURS[b][1]) ?? null;
}

const BLOCKING: ContractStatus[] = ['aceptado', 'confirmado', 'en_curso'];

function at(days: number, hour: number, minute = 0): Date {
  const { year, month, day } = bogotaParts(new Date());
  const base = bogotaDate(year, month, day, hour, minute);
  return new Date(base.getTime() + days * 24 * HOUR);
}

const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

const party = (id: string, name: string, rating: number | null, ratingCount: number): ContractParty => ({
  id,
  name,
  photoUrl: null,
  rating,
  ratingCount,
});

const ev = (at: Date, label: string, actor: Actor): ContractEvent => ({ at, label, actor });

function base(p: Partial<Contract> & Pick<Contract, 'id' | 'service' | 'client' | 'status' | 'createdAt' | 'scheduledAt' | 'price'>): Contract {
  return {
    origin: 'listing',
    acceptedAt: null,
    commune: 'Comuna 11, Laureles-Estadio',
    neighborhood: 'Laureles',
    address: 'Carrera 76 # 33-20, apto 501',
    rejectionReason: null,
    cancellation: null,
    completionRequestedAt: null,
    clientCompletion: null,
    issueReported: false,
    payments: [],
    reschedules: [],
    myRating: null,
    chat: { lastMessage: null, lastAt: null, unread: 0 },
    events: [ev(p.createdAt, 'Solicitud enviada', 'client')],
    ...p,
  };
}

function seed(): Contract[] {
  return [
    base({
      id: '2014',
      service: 'Closets y muebles de cocina a medida',
      client: party('c14', 'Marcela Ortiz', 4.6, 5),
      status: 'solicitado',
      createdAt: ago(17),
      scheduledAt: at(4, 9),
      price: 950000,
      neighborhood: 'Estadio',
      chat: { lastMessage: '¿Puedes llevar muestras de madera?', lastAt: ago(16), unread: 1 },
    }),
    base({
      id: '2013',
      service: 'Puertas macizas y marcos',
      client: party('c13', 'Andrés Gil', 4.9, 8),
      status: 'aceptado',
      createdAt: ago(30),
      acceptedAt: ago(6),
      scheduledAt: at(3, 14),
      price: 420000,
      origin: 'need',
      neighborhood: 'La América',
      commune: 'Comuna 12, La América',
      events: [ev(ago(30), 'Solicitud creada desde su necesidad', 'client'), ev(ago(6), 'Aceptaste la solicitud', 'provider')],
    }),
    base({
      id: '2012',
      service: 'Closets y muebles de cocina a medida',
      client: party('c12', 'Paula Duque', 4.2, 3),
      status: 'confirmado',
      createdAt: ago(80),
      acceptedAt: ago(70),
      scheduledAt: at(2, 14),
      price: 1200000,
      chat: { lastMessage: 'Perfecto, te espero el lunes.', lastAt: ago(20), unread: 0 },
      events: [
        ev(ago(80), 'Solicitud enviada', 'client'),
        ev(ago(70), 'Aceptaste la solicitud', 'provider'),
        ev(ago(60), 'Confirmó la contratación y se generó la cita', 'client'),
      ],
    }),
    base({
      id: '2011',
      service: 'Puertas macizas y marcos',
      client: party('c11', 'Juliana Restrepo', null, 0),
      status: 'confirmado',
      createdAt: ago(100),
      acceptedAt: ago(96),
      scheduledAt: new Date(Math.ceil((Date.now() + 18 * HOUR) / HOUR) * HOUR),
      price: 260000,
      neighborhood: 'Belén',
      commune: 'Comuna 16, Belén',
      events: [
        ev(ago(100), 'Solicitud enviada', 'client'),
        ev(ago(96), 'Aceptaste la solicitud', 'provider'),
        ev(ago(90), 'Confirmó la contratación y se generó la cita', 'client'),
      ],
    }),
    base({
      id: '2010',
      service: 'Puertas macizas y marcos',
      client: party('c10', 'Sebastián Cano', 4.8, 6),
      status: 'en_curso',
      createdAt: ago(150),
      acceptedAt: ago(140),
      scheduledAt: at(0, 8),
      price: 480000,
      neighborhood: 'Laureles',
      chat: { lastMessage: 'Ya estoy en la portería.', lastAt: ago(2), unread: 0 },
      events: [
        ev(ago(150), 'Solicitud enviada', 'client'),
        ev(ago(140), 'Aceptaste la solicitud', 'provider'),
        ev(ago(130), 'Confirmó la contratación y se generó la cita', 'client'),
        ev(ago(2), 'Iniciaste el servicio', 'provider'),
      ],
    }),
    base({
      id: '2009',
      service: 'Closets y muebles de cocina a medida',
      client: party('c9', 'Valentina Ríos', 5, 2),
      status: 'finalizado',
      createdAt: ago(240),
      acceptedAt: ago(230),
      scheduledAt: at(-1, 15),
      price: 780000,
      completionRequestedAt: ago(3),
      payments: [{ id: 'p9', method: 'bank_transfer', status: 'pending_confirmation', at: ago(1) }],
      events: [
        ev(ago(240), 'Solicitud enviada', 'client'),
        ev(ago(230), 'Aceptaste la solicitud', 'provider'),
        ev(ago(220), 'Confirmó la contratación y se generó la cita', 'client'),
        ev(ago(26), 'Iniciaste el servicio', 'provider'),
        ev(ago(3), 'Marcaste el servicio como finalizado', 'provider'),
        ev(ago(1), 'Marcó que pagó por transferencia', 'client'),
      ],
    }),
    base({
      id: '2008',
      service: 'Puertas macizas y marcos',
      client: party('c8', 'Camilo Arango', 4.5, 4),
      status: 'completado',
      createdAt: at(-12, 10),
      acceptedAt: at(-12, 12),
      scheduledAt: at(-8, 10),
      price: 350000,
      completionRequestedAt: at(-8, 16),
      clientCompletion: { at: at(-8, 19), automatic: false },
      payments: [{ id: 'p8', method: 'pse', status: 'paid', at: at(-8, 18) }],
      events: [
        ev(at(-12, 10), 'Solicitud enviada', 'client'),
        ev(at(-12, 12), 'Aceptaste la solicitud', 'provider'),
        ev(at(-11, 9), 'Confirmó la contratación y se generó la cita', 'client'),
        ev(at(-8, 10), 'Iniciaste el servicio', 'provider'),
        ev(at(-8, 16), 'Marcaste el servicio como finalizado', 'provider'),
        ev(at(-8, 18), 'Pagó por PSE', 'client'),
        ev(at(-8, 19), 'Confirmó la finalización y la contratación quedó completada', 'client'),
      ],
    }),
    base({
      id: '2007',
      service: 'Closets y muebles de cocina a medida',
      client: party('c7', 'Natalia Gil', 3.9, 7),
      status: 'cancelado',
      createdAt: at(-20, 11),
      acceptedAt: at(-20, 15),
      scheduledAt: at(-14, 9),
      price: 600000,
      cancellation: { by: 'client', kind: 'ordinary', reason: 'Decidí aplazar la remodelación.', at: at(-18, 10) },
      events: [
        ev(at(-20, 11), 'Solicitud enviada', 'client'),
        ev(at(-20, 15), 'Aceptaste la solicitud', 'provider'),
        ev(at(-18, 10), 'Canceló la contratación', 'client'),
      ],
    }),
    base({
      id: '2006',
      service: 'Puertas macizas y marcos',
      client: party('c6', 'Esteban Mora', 4.2, 5),
      status: 'rechazado',
      createdAt: at(-25, 9),
      scheduledAt: at(-22, 8),
      price: 300000,
      rejectionReason: 'No tenía disponibilidad ese día.',
      events: [ev(at(-25, 9), 'Solicitud enviada', 'client'), ev(at(-25, 13), 'Rechazaste la solicitud', 'provider')],
    }),
    base({
      id: '2005',
      service: 'Closets y muebles de cocina a medida',
      client: party('c5', 'Laura Pérez', null, 0),
      status: 'cancelado',
      createdAt: at(-30, 9),
      scheduledAt: at(-26, 14),
      price: 700000,
      cancellation: {
        by: 'system',
        kind: 'automatic',
        reason: 'Plazo vencido: no respondiste en 48 horas.',
        at: at(-28, 9),
      },
      events: [ev(at(-30, 9), 'Solicitud enviada', 'client'), ev(at(-28, 9), 'Se canceló por plazo vencido', 'system')],
    }),
  ];
}

/**
 * Contrataciones del prestador (HU-34 a HU-53).
 * Temporal: datos simulados en memoria; las acciones cambian el estado como lo hará el backend.
 * TODO: GET /api/provider/contracts y POST /api/provider/contracts/:id/<acción>.
 */
@Injectable({ providedIn: 'root' })

export class ProviderContractsService {
  private readonly store = signal<Contract[]>(seed());

  readonly contracts = computed(() =>
    [...this.store()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  );

  readonly availability: Record<number, TimeBlock[]> = {
    1: ['morning', 'afternoon'],
    2: ['morning', 'afternoon'],
    3: ['morning', 'afternoon'],
    4: ['morning', 'afternoon'],
    5: ['morning', 'afternoon'],
    6: ['morning'],
  };

  readonly bankAccount = { bank: 'Bancolombia', type: 'Ahorros', number: '•••• 2233' };

  get(id: string): Signal<Contract | undefined> {
    return computed(() => this.store().find((c) => c.id === id));
  }

  isSlotTaken(date: Date, block: TimeBlock, excludeId: string): boolean {
    const target = bogotaParts(date);
    return this.store().some((c) => {
      if (c.id === excludeId || !BLOCKING.includes(c.status)) return false;
      const p = bogotaParts(c.scheduledAt);
      return p.year === target.year && p.month === target.month && p.day === target.day && blockOf(c.scheduledAt) === block;
    });
  }

  accept(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'aceptado', acceptedAt: new Date() }), 'Aceptaste la solicitud', 'provider');
  }

  reject(id: string, reason: string): void {
    this.update(id, (c) => ({ ...c, status: 'rechazado', rejectionReason: reason || null }), 'Rechazaste la solicitud', 'provider');
  }

  start(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'en_curso' }), 'Iniciaste el servicio', 'provider');
  }

  finish(id: string): void {
    this.update(
      id,
      (c) => ({ ...c, status: 'finalizado', completionRequestedAt: new Date() }),
      'Marcaste el servicio como finalizado',
      'provider',
    );
  }

  cancel(id: string, reason: string, forceMajeure: boolean): void {
    this.update(
      id,
      (c) => ({
        ...c,
        status: 'cancelado',
        cancellation: { by: 'provider', kind: forceMajeure ? 'force_majeure' : 'ordinary', reason, at: new Date() },
      }),
      forceMajeure ? 'Cancelaste por fuerza mayor' : 'Cancelaste la contratación',
      'provider',
    );
  }

  requestReschedule(id: string, proposed: Date): void {
    this.update(
      id,
      (c) => ({
        ...c,
        reschedules: [
          ...c.reschedules,
          { id: crypto.randomUUID(), requestedBy: 'provider', previous: c.scheduledAt, proposed, status: 'pending', at: new Date() },
        ],
      }),
      'Solicitaste un reagendamiento',
      'provider',
    );
  }

  answerReschedule(id: string, accept: boolean): void {
    this.update(
      id,
      (c) => {
        const pending = c.reschedules.find((r) => r.status === 'pending');
        if (!pending) return c;
        return {
          ...c,
          scheduledAt: accept ? pending.proposed : c.scheduledAt,
          reschedules: c.reschedules.map((r) => (r === pending ? { ...r, status: accept ? 'accepted' : 'rejected' } : r)),
        };
      },
      accept ? 'Aceptaste el nuevo horario' : 'Rechazaste el nuevo horario',
      'provider',
    );
  }

  answerTransfer(id: string, received: boolean): void {
    this.update(
      id,
      (c) => ({
        ...c,
        payments: c.payments.map((p) =>
          p.status === 'pending_confirmation'
            ? { ...p, status: received ? 'paid' : 'rejected', at: new Date(), note: received ? undefined : 'No recibida' }
            : p,
        ),
      }),
      received ? 'Confirmaste que recibiste la transferencia' : 'Indicaste que no recibiste la transferencia',
      'provider',
    );
  }

  reportIssue(id: string): void {
    this.update(id, (c) => ({ ...c, issueReported: true }), 'Reportaste un problema', 'provider');
  }

  rate(id: string, score: number, comment: string): void {
    this.update(id, (c) => ({ ...c, myRating: { score, comment } }), 'Calificaste al cliente', 'provider');
  }


  simulateClientConfirm(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'confirmado' }), 'Confirmó la contratación y se generó la cita', 'client');
  }

  simulateClientReschedule(id: string): void {
    this.update(
      id,
      (c) => ({
        ...c,
        reschedules: [
          ...c.reschedules,
          {
            id: crypto.randomUUID(),
            requestedBy: 'client',
            previous: c.scheduledAt,
            proposed: new Date(c.scheduledAt.getTime() + 24 * HOUR),
            status: 'pending',
            at: new Date(),
          },
        ],
      }),
      'Solicitó un reagendamiento',
      'client',
    );
  }

  simulateAppointmentSoon(id: string): void {
    this.update(id, (c) => ({ ...c, scheduledAt: new Date(Date.now() + 10 * HOUR) }));
  }

  simulateTransferMarked(id: string): void {
    this.addPayment(id, 'bank_transfer', 'pending_confirmation', 'Marcó que pagó por transferencia');
  }

  simulatePsePaid(id: string): void {
    this.addPayment(id, 'pse', 'paid', 'Pagó por PSE');
  }

  simulateClientCompletion(id: string): void {
    this.update(id, (c) => ({ ...c, clientCompletion: { at: new Date(), automatic: false } }), 'Confirmó la finalización', 'client');
  }

  private addPayment(id: string, method: PaymentAttempt['method'], status: PaymentAttempt['status'], label: string): void {
    this.update(
      id,
      (c) => ({ ...c, payments: [...c.payments, { id: crypto.randomUUID(), method, status, at: new Date() }] }),
      label,
      'client',
    );
  }

  private update(id: string, change: (c: Contract) => Contract, label?: string, actor: Actor = 'provider'): void {
    this.store.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        let next = change(c);
        if (label) next = { ...next, events: [...next.events, ev(new Date(), label, actor)] };
        return settle(next);
      }),
    );
  }
}

function settle(c: Contract): Contract {
  if (c.status !== 'finalizado' || !c.clientCompletion || paymentStatus(c) !== 'paid') return c;
  return { ...c, status: 'completado', events: [...c.events, ev(new Date(), 'La contratación quedó completada', 'system')] };
}

export function pendingReschedule(c: Contract) {
  return c.reschedules.find((r) => r.status === 'pending') ?? null;
}

export function reschedulesLeft(c: Contract): number {
  return MAX_RESCHEDULES - c.reschedules.length;
}

export function reachedStatus(c: Contract): ContractStatus {
  if (c.status !== 'cancelado' && c.status !== 'rechazado') return c.status;
  const has = (start: string) => c.events.some((e) => e.label.startsWith(start));
  if (has('Iniciaste')) return 'en_curso';
  if (has('Confirmó la contratación')) return 'confirmado';
  return c.acceptedAt ? 'aceptado' : 'solicitado';
}

export const RESPONSE_WINDOW_MS = 48 * HOUR;
export const CONFIRM_WINDOW_MS = 24 * HOUR;
export const COMPLETION_WINDOW_MS = 24 * HOUR;
export const LATE_CANCEL_MS = 24 * HOUR;

export function activeDeadline(c: Contract): { kind: 'respond' | 'client_confirm' | 'appointment' | 'completion'; at: Date } | null {
  switch (c.status) {
    case 'solicitado':
      return { kind: 'respond', at: new Date(c.createdAt.getTime() + RESPONSE_WINDOW_MS) };
    case 'aceptado':
      return c.acceptedAt ? { kind: 'client_confirm', at: new Date(c.acceptedAt.getTime() + CONFIRM_WINDOW_MS) } : null;
    case 'confirmado':
      return { kind: 'appointment', at: c.scheduledAt };
    case 'finalizado':
      return c.completionRequestedAt && !c.clientCompletion
        ? { kind: 'completion', at: new Date(c.completionRequestedAt.getTime() + COMPLETION_WINDOW_MS) }
        : null;
    default:
      return null;
  }
}
