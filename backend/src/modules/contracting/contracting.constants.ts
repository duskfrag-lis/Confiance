/** HU-34 a HU-38: estados de una contratación (catálogo request_statuses; la base ya usa los nombres en español). */
export const REQUEST_STATES = [
  'solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado', 'cancelado', 'rechazado',
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

/** HU-34.4: días que se ofrecen al elegir la fecha de una solicitud (hoy incluido). */
export const SLOT_DAYS = 14;

/** HU-36.5 y HU-37.5: cada cuánto corre la cancelación automática (HU-52). */
export const AUTO_CANCEL_CRON = '*/15 * * * *';

/** Plazos de la V7, en horas: respuesta del prestador (HU-52.1), confirmación del cliente (HU-52.2) y de la finalización (HU-47). */
export const DEADLINE_HOURS = { respuesta_prestador: 48, confirmacion_cliente: 24, confirmacion_finalizacion: 24 } as const;

/** HU-50: la cancelación ordinaria solo hasta 24 h antes de la cita. */
export const CANCEL_NOTICE_HOURS = 24;

/** HU-53.4: máximo de solicitudes de reagendamiento por contratación (fn_check_reschedule_limit). */
export const MAX_RESCHEDULES = 2;

/** HU-38.2: el prestador ve la dirección exacta desde ACEPTADO (no en una que terminó cancelada o rechazada). */
export const ADDRESS_VISIBLE_STATES: RequestState[] = ['aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado'];

/** HU-38.6: acciones que la interfaz puede mostrar. Cada una la hace su propia HU; aquí solo se dice si aplica. */
export type ContractAction =
  | 'aceptar' | 'rechazar' | 'confirmar' | 'cancelar' | 'cancelar_fuerza_mayor' | 'reagendar' | 'responder_reagendamiento'
  | 'iniciar' | 'finalizar' | 'confirmar_finalizacion' | 'pagar' | 'confirmar_transferencia' | 'reportar' | 'calificar'
  | 'reclamar';

/** Estado del pago en la API (HU-45), con el PSE en curso aparte para que la interfaz no ofrezca pagar dos veces. */
export type PaymentState = 'pendiente' | 'en_proceso' | 'pendiente_confirmacion' | 'pagado';

export const PAYMENT_METHODS: Record<string, 'pse' | 'transferencia'> = { pse: 'pse', bank_transfer: 'transferencia' };

export const PAYMENT_ATTEMPT_STATES: Record<string, 'pendiente' | 'rechazado' | 'pendiente_confirmacion' | 'pagado'> = {
  pending: 'pendiente',
  rejected: 'rechazado',
  pending_confirmation: 'pendiente_confirmacion',
  paid: 'pagado',
};

export const RESCHEDULE_STATES: Record<string, 'pendiente' | 'aceptado' | 'rechazado'> = {
  pending: 'pendiente',
  accepted: 'aceptado',
  rejected: 'rechazado',
};

export const FORCE_MAJEURE_STATES: Record<string, 'pendiente' | 'aprobada' | 'rechazada'> = {
  pending: 'pendiente',
  approved: 'aprobada',
  rejected: 'rechazada',
};
