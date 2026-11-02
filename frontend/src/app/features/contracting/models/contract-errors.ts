/** Mensajes de los errores que devuelve el API al actuar sobre una contratación (E5, E8, E11). */
export const CONTRACT_ERRORS: Record<string, string> = {
  REQUEST_STATE: 'Esta contratación cambió de estado. La actualizamos.',
  PAST_DATE: 'Esa fecha ya pasó. Elige una fecha futura.',
  SLOT_TAKEN: 'Ese día y franja ya están ocupados por otra contratación. Elige otro horario.',
  OUTSIDE_AVAILABILITY: 'Ese horario está fuera de la disponibilidad del prestador. Elige otro.',
  CANCEL_NOTICE: 'Faltan 24 horas o menos para la cita: solo puedes cancelar por fuerza mayor.',
  EVIDENCE_NOT_ALLOWED: 'La evidencia solo se adjunta al cancelar por fuerza mayor.',
  EVIDENCE_COUNT: 'Adjunta una sola evidencia.',
  INVALID_EVIDENCE: 'La evidencia debe ser una foto JPG o PNG, o un PDF.',
  EVIDENCE_TOO_LARGE: 'La evidencia puede pesar máximo 5 MB.',
  SAME_DATE: 'Elige una fecha u hora distinta a la actual.',
  RESCHEDULE_PENDING: 'Ya hay un cambio de horario esperando respuesta.',
  RESCHEDULE_LIMIT: 'Esta contratación ya usó sus 2 cambios de horario.',
  RESCHEDULE_OWN: 'La otra parte es quien debe responder este cambio de horario.',
  RESCHEDULE_NONE: 'Ya no hay un cambio de horario pendiente. La actualizamos.',
};

/** Errores que significan que lo que ve el usuario quedó desactualizado: se vuelve a cargar la contratación. */
export const RELOAD_ON = ['REQUEST_STATE', 'RESCHEDULE_NONE', 'RESCHEDULE_PENDING'];
