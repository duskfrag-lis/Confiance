/** HU-34 a HU-38: estados de una contratación (catálogo request_statuses; la base ya usa los nombres en español). */
export const REQUEST_STATES = [
  'solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado', 'cancelado', 'rechazado',
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

/** HU-34.4: días que se ofrecen al elegir la fecha de una solicitud (hoy incluido). */
export const SLOT_DAYS = 14;

/** HU-36.5 y HU-37.5: cada cuánto corre la cancelación automática (HU-52). */
export const AUTO_CANCEL_CRON = '*/15 * * * *';
