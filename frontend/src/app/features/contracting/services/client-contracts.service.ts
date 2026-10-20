import { Injectable, Signal, computed, signal } from '@angular/core';
import { Observable, map, timer } from 'rxjs';
import { bogotaDate, bogotaParts } from '../../../shared/utils/format';
import {
  Actor,
  BankAccountView,
  ClientContract,
  ContractEvent,
  ContractStatus,
  PaymentAttempt,
  TimeBlock,
  paymentStatus,
} from '../models/contract';
import { blockOf } from './provider-contracts.service';

const HOUR = 3_600_000;

const BLOCKING: ContractStatus[] = ['aceptado', 'confirmado', 'en_curso'];

function at(days: number, hour: number, minute = 0): Date {
  const { year, month, day } = bogotaParts(new Date());
  return new Date(bogotaDate(year, month, day, hour, minute).getTime() + days * 24 * HOUR);
}

const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

const ev = (when: Date, label: string, actor: Actor): ContractEvent => ({ at: when, label, actor });

type Provider = ClientContract['provider'];

const provider = (profileId: string, name: string, rating: number | null, ratingCount: number, verified: boolean): Provider => ({
  id: `u${profileId}`,
  profileId,
  name,
  photoUrl: null,
  rating,
  ratingCount,
  verified,
});

const BANCOLOMBIA: BankAccountView = { bank: 'Bancolombia', type: 'Ahorros', number: '•••• 4521' };

const WEEKDAYS: Record<number, TimeBlock[]> = {
  1: ['morning', 'afternoon'],
  2: ['morning', 'afternoon'],
  3: ['morning', 'afternoon'],
  4: ['morning', 'afternoon'],
  5: ['morning', 'afternoon'],
  6: ['morning'],
};

function base(
  p: Partial<ClientContract> & Pick<ClientContract, 'id' | 'service' | 'provider' | 'status' | 'createdAt' | 'scheduledAt' | 'price'>,
): ClientContract {
  return {
    origin: 'listing',
    acceptedAt: null,
    commune: 'Comuna 11, Laureles-Estadio',
    neighborhood: 'Laureles',
    address: 'Calle 50 # 70-20',
    rejectionReason: null,
    cancellation: null,
    completionRequestedAt: null,
    clientCompletion: null,
    issueReported: false,
    payments: [],
    reschedules: [],
    myRating: null,
    chat: { lastMessage: null, lastAt: null, unread: 0 },
    bankAccount: BANCOLOMBIA,
    events: [ev(p.createdAt, 'Enviaste la solicitud', 'client')],
    ...p,
  };
}

function seed(): ClientContract[] {
  const luisa = provider('11', 'Luisa Ruiz', 4.6, 31, true);
  const juan = provider('12', 'Juan Pérez', 4.3, 12, false);
  const carlos = provider('13', 'Carlos Ramírez', 4.8, 22, true);
  const maria = provider('14', 'María González', 4.9, 40, true);
  const andres = provider('15', 'Andrés Torres', 4.1, 7, false);
  const diego = provider('16', 'Diego Salazar', 4.7, 18, true);

  return [
    base({
      id: '1046',
      service: 'Pintura de interiores',
      provider: andres,
      status: 'solicitado',
      createdAt: ago(5),
      scheduledAt: at(5, 9),
      price: 150000,
      origin: 'need',
    }),
    base({
      id: '1045',
      service: 'Muebles a medida y closets',
      provider: maria,
      status: 'aceptado',
      createdAt: ago(20),
      acceptedAt: ago(6),
      scheduledAt: at(4, 14),
      price: 900000,
      chat: { lastMessage: 'Llevo el catálogo de maderas.', lastAt: ago(5), unread: 1 },
      events: [ev(ago(20), 'Enviaste la solicitud', 'client'), ev(ago(6), 'Aceptó la solicitud', 'provider')],
    }),
    base({
      id: '1044',
      service: 'Instalación de lámparas y tomas',
      provider: carlos,
      status: 'confirmado',
      createdAt: ago(70),
      acceptedAt: ago(60),
      scheduledAt: at(2, 8),
      price: 120000,
      events: [
        ev(ago(70), 'Enviaste la solicitud', 'client'),
        ev(ago(60), 'Aceptó la solicitud', 'provider'),
        ev(ago(50), 'Confirmaste las condiciones y se generó la cita', 'client'),
      ],
    }),
    base({
      id: '1043',
      service: 'Instalación de grifería y lavamanos',
      provider: juan,
      status: 'en_curso',
      createdAt: ago(120),
      acceptedAt: ago(110),
      scheduledAt: at(0, 9),
      price: 90000,
      bankAccount: null,
      events: [
        ev(ago(120), 'Enviaste la solicitud', 'client'),
        ev(ago(110), 'Aceptó la solicitud', 'provider'),
        ev(ago(100), 'Confirmaste las condiciones y se generó la cita', 'client'),
        ev(ago(1), 'Inició el servicio', 'provider'),
      ],
    }),
    base({
      id: '1042',
      service: 'Aseo profundo de apartamentos',
      provider: luisa,
      status: 'finalizado',
      createdAt: ago(200),
      acceptedAt: ago(190),
      scheduledAt: at(-1, 10),
      price: 120000,
      completionRequestedAt: ago(3),
      chat: { lastMessage: 'Quedó listo, cualquier cosa me escribes.', lastAt: ago(3), unread: 0 },
      events: [
        ev(ago(200), 'Enviaste la solicitud', 'client'),
        ev(ago(190), 'Aceptó la solicitud', 'provider'),
        ev(ago(180), 'Confirmaste las condiciones y se generó la cita', 'client'),
        ev(ago(28), 'Inició el servicio', 'provider'),
        ev(ago(3), 'Marcó el servicio como finalizado', 'provider'),
      ],
    }),
    base({
      id: '1041',
      service: 'Apertura y cambio de cerraduras',
      provider: diego,
      status: 'completado',
      createdAt: at(-30, 9),
      acceptedAt: at(-30, 11),
      scheduledAt: at(-27, 16),
      price: 80000,
      completionRequestedAt: at(-27, 18),
      clientCompletion: { at: at(-27, 19), automatic: false },
      payments: [{ id: 'p41', method: 'pse', status: 'paid', at: at(-27, 19) }],
      events: [
        ev(at(-30, 9), 'Enviaste la solicitud', 'client'),
        ev(at(-30, 11), 'Aceptó la solicitud', 'provider'),
        ev(at(-29, 8), 'Confirmaste las condiciones y se generó la cita', 'client'),
        ev(at(-27, 16), 'Inició el servicio', 'provider'),
        ev(at(-27, 18), 'Marcó el servicio como finalizado', 'provider'),
        ev(at(-27, 19), 'Pagaste por PSE', 'client'),
        ev(at(-27, 19), 'Confirmaste la finalización y la contratación quedó completada', 'client'),
      ],
    }),
    base({
      id: '1040',
      service: 'Reparación de fugas y destapes',
      provider: juan,
      status: 'cancelado',
      createdAt: at(-36, 8),
      acceptedAt: at(-36, 10),
      scheduledAt: at(-34, 8),
      price: 100000,
      bankAccount: null,
      cancellation: { by: 'client', kind: 'ordinary', reason: 'Cambio de planes, ya lo arreglé.', at: at(-35, 9) },
      events: [
        ev(at(-36, 8), 'Enviaste la solicitud', 'client'),
        ev(at(-36, 10), 'Aceptó la solicitud', 'provider'),
        ev(at(-35, 9), 'Cancelaste la contratación', 'client'),
      ],
    }),
    base({
      id: '1039',
      service: 'Pintura de interiores',
      provider: andres,
      status: 'rechazado',
      createdAt: at(-46, 9),
      scheduledAt: at(-45, 9),
      price: 150000,
      rejectionReason: 'No tengo disponibilidad esa semana.',
      events: [ev(at(-46, 9), 'Enviaste la solicitud', 'client'), ev(at(-46, 15), 'Rechazó la solicitud', 'provider')],
    }),
  ];
}

/**
 * Contrataciones del cliente (HU-12, HU-34 a HU-53, pagos HU-43 a HU-45).
 * Temporal: datos simulados en memoria.
 * TODO: GET /api/client/contracts y POST /api/client/contracts/:id/<acción>; PSE con Wompi (sandbox).
 */
@Injectable({ providedIn: 'root' })
export class ClientContractsService {
  private readonly store = signal<ClientContract[]>(seed());

  readonly failNextPse = signal(false);

  readonly contracts = computed(() =>
    [...this.store()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  );

  get(id: string): Signal<ClientContract | undefined> {
    return computed(() => this.store().find((c) => c.id === id));
  }

  availabilityOf(_providerProfileId: string): Record<number, TimeBlock[]> {
    return WEEKDAYS;
  }

  isSlotTaken(providerProfileId: string, date: Date, block: TimeBlock, excludeId: string): boolean {
    const target = bogotaParts(date);
    return this.store().some((c) => {
      if (c.id === excludeId || c.provider.profileId !== providerProfileId || !BLOCKING.includes(c.status)) return false;
      const p = bogotaParts(c.scheduledAt);
      return p.year === target.year && p.month === target.month && p.day === target.day && blockOf(c.scheduledAt) === block;
    });
  }

  cancel(id: string, reason: string, forceMajeure: boolean): void {
    this.update(
      id,
      (c) => ({
        ...c,
        status: 'cancelado',
        cancellation: { by: 'client', kind: forceMajeure ? 'force_majeure' : 'ordinary', reason, at: new Date() },
      }),
      forceMajeure ? 'Cancelaste por fuerza mayor' : 'Cancelaste la contratación',
      'client',
    );
  }

  confirmConditions(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'confirmado' }), 'Confirmaste las condiciones y se generó la cita', 'client');
  }

  requestReschedule(id: string, proposed: Date): void {
    this.update(
      id,
      (c) => ({
        ...c,
        reschedules: [
          ...c.reschedules,
          { id: crypto.randomUUID(), requestedBy: 'client', previous: c.scheduledAt, proposed, status: 'pending', at: new Date() },
        ],
      }),
      'Solicitaste un reagendamiento',
      'client',
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
      'client',
    );
  }

  confirmCompletion(id: string): void {
    this.update(id, (c) => ({ ...c, clientCompletion: { at: new Date(), automatic: false } }), 'Confirmaste la finalización', 'client');
  }

  payPse(id: string): Observable<boolean> {
    const approved = !this.failNextPse();
    this.failNextPse.set(false);
    return timer(1600).pipe(
      map(() => {
        this.addPayment(
          id,
          { id: crypto.randomUUID(), method: 'pse', status: approved ? 'paid' : 'rejected', at: new Date(), note: approved ? undefined : 'Rechazado por el banco' },
          approved ? 'Pagaste por PSE' : 'El pago por PSE fue rechazado',
          approved ? 'client' : 'system',
        );
        return approved;
      }),
    );
  }

  markTransfer(id: string): void {
    this.addPayment(
      id,
      { id: crypto.randomUUID(), method: 'bank_transfer', status: 'pending_confirmation', at: new Date() },
      'Marcaste que pagaste por transferencia',
      'client',
    );
  }

  reportIssue(id: string): void {
    this.update(id, (c) => ({ ...c, issueReported: true }), 'Reportaste un problema', 'client');
  }

  rate(id: string, score: number, comment: string): void {
    this.update(id, (c) => ({ ...c, myRating: { score, comment } }), 'Calificaste al prestador', 'client');
  }

  simulateAccept(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'aceptado', acceptedAt: new Date() }), 'Aceptó la solicitud', 'provider');
  }

  simulateReject(id: string): void {
    this.update(
      id,
      (c) => ({ ...c, status: 'rechazado', rejectionReason: 'No tengo disponibilidad ese día.' }),
      'Rechazó la solicitud',
      'provider',
    );
  }

  simulateStart(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'en_curso' }), 'Inició el servicio', 'provider');
  }

  simulateFinish(id: string): void {
    this.update(id, (c) => ({ ...c, status: 'finalizado', completionRequestedAt: new Date() }), 'Marcó el servicio como finalizado', 'provider');
  }

  simulateTransferAnswer(id: string, received: boolean): void {
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
      received ? 'Confirmó que recibió la transferencia' : 'Indicó que no recibió la transferencia',
      'provider',
    );
  }

  simulateProviderReschedule(id: string): void {
    this.update(
      id,
      (c) => ({
        ...c,
        reschedules: [
          ...c.reschedules,
          {
            id: crypto.randomUUID(),
            requestedBy: 'provider',
            previous: c.scheduledAt,
            proposed: new Date(c.scheduledAt.getTime() + 24 * HOUR),
            status: 'pending',
            at: new Date(),
          },
        ],
      }),
      'Solicitó un reagendamiento',
      'provider',
    );
  }

  simulateAppointmentSoon(id: string): void {
    this.update(id, (c) => ({ ...c, scheduledAt: new Date(Date.now() + 10 * HOUR) }));
  }

  private addPayment(id: string, payment: PaymentAttempt, label: string, actor: Actor): void {
    this.update(id, (c) => ({ ...c, payments: [...c.payments, payment] }), label, actor);
  }

  private update(id: string, change: (c: ClientContract) => ClientContract, label?: string, actor: Actor = 'client'): void {
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

function settle(c: ClientContract): ClientContract {
  if (c.status !== 'finalizado' || !c.clientCompletion || paymentStatus(c) !== 'paid') return c;
  return { ...c, status: 'completado', events: [...c.events, ev(new Date(), 'La contratación quedó completada', 'system')] };
}

