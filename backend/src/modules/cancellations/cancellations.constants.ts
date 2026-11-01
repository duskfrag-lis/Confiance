/** HU-50 y HU-51: largo máximo del motivo de una cancelación (columna cancellations.reason). */
export const CANCEL_REASON_MAX_LENGTH = 500;

/** HU-51: carpeta privada de las evidencias de fuerza mayor en el almacenamiento (HU-60). */
export const FORCE_MAJEURE_FOLDER = 'force-majeure';

/** Fecha y hora en Colombia para los avisos ("lunes 27 de octubre, 9:00 a. m."). */
export const bogotaDateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});
