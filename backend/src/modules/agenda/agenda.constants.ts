/** HU-40.2 y HU-41.2: estados de una cita (catálogo appointment_statuses). La API usa los nombres en español. */
export const APPOINTMENT_STATES = {
  proxima: 'upcoming',
  en_curso: 'in_progress',
  completada: 'completed',
  cancelada: 'cancelled',
} as const;

export type AppointmentStateKey = keyof typeof APPOINTMENT_STATES;
export const APPOINTMENT_STATE_KEYS = Object.keys(APPOINTMENT_STATES) as AppointmentStateKey[];
export const appointmentStateKeyOf = (dbName: string) => APPOINTMENT_STATE_KEYS.find((k) => APPOINTMENT_STATES[k] === dbName)!;
