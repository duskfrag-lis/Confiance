import { environment } from '../../../../environments/environment';

export type ContractStatus =
  | 'solicitado'
  | 'aceptado'
  | 'confirmado'
  | 'en_curso'
  | 'finalizado'
  | 'completado'
  | 'rechazado'
  | 'cancelado';

export type Actor = 'provider' | 'client' | 'system';

export type PaymentMethod = 'pse' | 'bank_transfer';

export type PaymentAttemptStatus = 'pending' | 'pending_confirmation' | 'paid' | 'rejected';

export type PaymentStatus = 'pending' | 'pending_confirmation' | 'paid';

export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export type ContractAction =
  | 'aceptar'
  | 'rechazar'
  | 'confirmar'
  | 'cancelar'
  | 'cancelar_fuerza_mayor'
  | 'reagendar'
  | 'responder_reagendamiento'
  | 'iniciar'
  | 'finalizar'
  | 'confirmar_finalizacion'
  | 'pagar'
  | 'confirmar_transferencia'
  | 'reportar'
  | 'calificar'
  | 'reclamar';

export type DeadlineKind = 'respond' | 'client_confirm' | 'completion';

export interface ContractParty {
  id: string;
  name: string;
  photoUrl: string | null;
  rating: number | null;
  ratingCount: number;
}

export interface ContractEvent {
  at: Date;
  label: string;
  actor: Actor;
}

export interface PaymentAttempt {
  id: string;
  method: PaymentMethod;
  status: PaymentAttemptStatus;
  at: Date;
  note?: string;
}

export interface Cancellation {
  by: Actor;
  kind: 'ordinary' | 'force_majeure' | 'automatic';
  reason: string;
  at: Date;
  evaluation: 'pendiente' | 'aprobada' | 'rechazada' | null;
}

export interface RescheduleRequest {
  id: string;
  requestedBy: 'provider' | 'client';
  previous: Date;
  proposed: Date;
  status: 'pending' | 'accepted' | 'rejected';
  at: Date;
}

export interface ContractCore {
  id: string;
  service: string;
  origin: 'listing' | 'need';
  status: ContractStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  scheduledAt: Date;
  commune: string;
  neighborhood: string;
  address: string;
  price: number;
  rejectionReason: string | null;
  cancellation: Cancellation | null;
  completionRequestedAt: Date | null;
  clientCompletion: { at: Date; automatic: boolean } | null;
  issueReported: boolean;
  payments: PaymentAttempt[];
  reschedules: RescheduleRequest[];
  myRating: { score: number; comment: string } | null;
  events: ContractEvent[];
  reached: ContractStatus; 
  deadline: { kind: DeadlineKind; at: Date } | null;
  actions: ContractAction[];
}

export interface Contract extends ContractCore {
  client: ContractParty;
}

export interface BankAccountView {
  bank: string;
  type: string;
  number: string;
}

export interface ClientContract extends ContractCore {
  provider: ContractParty & { profileId: string; verified: boolean };
  bankAccount: BankAccountView | null;
}

export const STATUS_LABEL: Record<ContractStatus, string> = {
  solicitado: 'Solicitado',
  aceptado: 'Aceptado',
  confirmado: 'Confirmado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  completado: 'Completado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
};

export const FLOW: ContractStatus[] = ['solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado'];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pse: 'PSE',
  bank_transfer: 'Transferencia',
};

export const MAX_RESCHEDULES = 2;

export function paymentStatus(c: ContractCore): PaymentStatus {
  if (c.payments.some((p) => p.status === 'paid')) return 'paid';
  if (c.payments.some((p) => p.status === 'pending_confirmation')) return 'pending_confirmation';
  return 'pending';
}


export function bankInfoVisibleToClient(status: ContractStatus): boolean {
  return status === 'aceptado' || status === 'confirmado' || status === 'en_curso' || status === 'finalizado';
}

/** Sin backend todavía: pagos (E9) y calificación (E10). Solo aparecen con el simulador encendido. */
const MOCKED: ContractAction[] = ['pagar', 'confirmar_transferencia', 'calificar'];

const IMPLEMENTED: ContractAction[] = [
  'aceptar',
  'rechazar',
  'confirmar',
  'cancelar',
  'cancelar_fuerza_mayor',
  'reagendar',
  'responder_reagendamiento',
  'iniciar',
  'finalizar',
  'confirmar_finalizacion',
  'reportar',
  'reclamar',
  ...(environment.mockApi ? MOCKED : []),
];

export function can(c: ContractCore, action: ContractAction): boolean {
  return IMPLEMENTED.includes(action) && c.actions.includes(action);
}

export const HOUR_MS = 3_600_000;
export const LATE_CANCEL_MS = 24 * HOUR_MS;

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

export function pendingReschedule(c: ContractCore): RescheduleRequest | null {
  return c.reschedules.find((r) => r.status === 'pending') ?? null;
}

export function reschedulesLeft(c: ContractCore): number {
  return MAX_RESCHEDULES - c.reschedules.length;
}

export function activeDeadline(c: ContractCore): { kind: DeadlineKind | 'appointment'; at: Date } | null {
  if (c.deadline) return c.deadline;
  return c.status === 'confirmado' ? { kind: 'appointment', at: c.scheduledAt } : null;
}

const WEEKDAY: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const BLOCK: Record<string, TimeBlock> = { manana: 'morning', tarde: 'afternoon', noche: 'evening' };

export function availabilityFrom(slots: { dia: string; bloque: string }[]): Record<number, TimeBlock[]> {
  const out: Record<number, TimeBlock[]> = {};
  for (const s of slots) (out[WEEKDAY[s.dia]] ??= []).push(BLOCK[s.bloque]);
  return out;
}
