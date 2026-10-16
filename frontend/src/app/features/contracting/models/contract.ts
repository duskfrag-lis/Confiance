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
}

export interface RescheduleRequest {
  id: string;
  requestedBy: 'provider' | 'client';
  previous: Date;
  proposed: Date;
  status: 'pending' | 'accepted' | 'rejected';
  at: Date;
}

export interface Contract {
  id: string;
  service: string;
  origin: 'listing' | 'need';
  client: ContractParty;
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
  chat: { lastMessage: string | null; lastAt: Date | null; unread: number };
  events: ContractEvent[];
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

export function paymentStatus(c: Contract): PaymentStatus {
  if (c.payments.some((p) => p.status === 'paid')) return 'paid';
  if (c.payments.some((p) => p.status === 'pending_confirmation')) return 'pending_confirmation';
  return 'pending';
}


export function bankInfoVisibleToClient(status: ContractStatus): boolean {
  return status === 'aceptado' || status === 'confirmado' || status === 'en_curso' || status === 'finalizado';
}
