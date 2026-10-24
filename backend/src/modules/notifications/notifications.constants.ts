/** Tipos del catálogo notification_types (migración seed_catalogs). */
export type NotificationTypeName =
  | 'interest_received' | 'interest_selected' | 'interest_not_selected'
  | 'request_received' | 'request_accepted' | 'request_rejected' | 'request_confirmed'
  | 'request_auto_cancelled' | 'request_cancelled' | 'request_status_changed' | 'completion_requested'
  | 'service_start_reminder' | 'new_chat_message' | 'reschedule_requested' | 'reschedule_answered'
  | 'payment_pending' | 'payment_approved' | 'payment_rejected'
  | 'transfer_marked' | 'transfer_confirmed' | 'transfer_not_received'
  | 'force_majeure_result' | 'verification_result' | 'claim_updated';

/** Tema de la notificación en la API: la interfaz elige con él el ícono, el color y el filtro. */
export type NotificationKind =
  | 'solicitud' | 'contratacion' | 'servicio' | 'cancelacion' | 'reagendamiento' | 'recordatorio'
  | 'mensaje' | 'pago' | 'interes' | 'necesidad' | 'verificacion' | 'reclamo';

/**
 * HU-62: cada tipo de la base con su tema y su título. La tabla guarda solo el detalle (`message`); el título es
 * fijo por tipo para que la bandeja se lea igual en todas las notificaciones.
 */
export const NOTIFICATION_VIEW: Record<NotificationTypeName, { tipo: NotificationKind; titulo: string }> = {
  interest_received: { tipo: 'interes', titulo: 'Nuevo interés en tu necesidad' },
  interest_selected: { tipo: 'necesidad', titulo: 'Te eligieron para una necesidad' },
  interest_not_selected: { tipo: 'necesidad', titulo: 'Eligieron a otro prestador' },
  request_received: { tipo: 'solicitud', titulo: 'Nueva solicitud de servicio' },
  request_accepted: { tipo: 'solicitud', titulo: 'Aceptaron tu solicitud' },
  request_rejected: { tipo: 'solicitud', titulo: 'Rechazaron tu solicitud' },
  request_confirmed: { tipo: 'contratacion', titulo: 'Contratación confirmada' },
  request_auto_cancelled: { tipo: 'cancelacion', titulo: 'Contratación cancelada por plazo vencido' },
  request_cancelled: { tipo: 'cancelacion', titulo: 'Contratación cancelada' },
  request_status_changed: { tipo: 'contratacion', titulo: 'La contratación cambió de estado' },
  completion_requested: { tipo: 'servicio', titulo: 'El servicio quedó finalizado' },
  service_start_reminder: { tipo: 'recordatorio', titulo: 'Recordatorio de tu servicio' },
  new_chat_message: { tipo: 'mensaje', titulo: 'Mensaje nuevo' },
  reschedule_requested: { tipo: 'reagendamiento', titulo: 'Proponen un nuevo horario' },
  reschedule_answered: { tipo: 'reagendamiento', titulo: 'Respondieron tu propuesta de horario' },
  payment_pending: { tipo: 'pago', titulo: 'Pago pendiente' },
  payment_approved: { tipo: 'pago', titulo: 'Pago aprobado' },
  payment_rejected: { tipo: 'pago', titulo: 'Pago rechazado' },
  transfer_marked: { tipo: 'pago', titulo: 'Transferencia marcada como hecha' },
  transfer_confirmed: { tipo: 'pago', titulo: 'Transferencia confirmada' },
  transfer_not_received: { tipo: 'pago', titulo: 'Transferencia no recibida' },
  force_majeure_result: { tipo: 'cancelacion', titulo: 'Resultado de la fuerza mayor' },
  verification_result: { tipo: 'verificacion', titulo: 'Resultado de tu verificación' },
  claim_updated: { tipo: 'reclamo', titulo: 'Tu reclamo tiene novedades' },
};

/** Avisos de la cuenta que solo tienen sentido en el perfil de prestador. */
export const PROVIDER_ONLY_TYPES: NotificationTypeName[] = ['verification_result'];

/** Cuántas notificaciones devuelve la bandeja, de la más reciente a la más antigua. */
export const NOTIFICATIONS_LIMIT = 100;
