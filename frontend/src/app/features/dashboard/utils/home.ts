import { Appointment } from '../../agenda/models/appointment.models';
import { bogotaHour } from '../../../shared/utils/format';
import { NextAppointment } from '../models/home.models';

const DAY_MS = 86_400_000;

export function greeting(): string {
  const h = bogotaHour();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function upcoming(list: Appointment[]): Appointment[] {
  return list
    .filter((a) => a.estado === 'proxima' || a.estado === 'en_curso')
    .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
}

export function toNextAppointment(a: Appointment, base: string): NextAppointment {
  const other = a.prestador ?? a.cliente;
  return {
    contractId: a.contratacionId,
    service: a.servicio,
    date: new Date(a.fechaHora),
    inProgress: a.estado === 'en_curso',
    counterpart: { name: other?.nombre ?? '—', photoUrl: other?.fotoUrl ?? null },
    place: `${a.zona.barrio}, ${a.zona.comuna}`,
    link: [base, 'contrataciones', a.contratacionId],
  };
}

export const withinDays = (iso: string, days: number, now = Date.now()): boolean => new Date(iso).getTime() - now <= days * DAY_MS;

export function isTodayOrPast(date: Date): boolean {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
  return key(date) <= key(new Date());
}
