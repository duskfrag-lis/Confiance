import { bogotaParts, formatTime } from '../../../shared/utils/format';
import { Appointment } from '../models/appointment.models';

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const longDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const keyOf = (p: { year: number; month: number; day: number }) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;

export const dateOfKey = (key: string) => new Date(`${key}T12:00:00Z`);

export const dayKeyOf = (iso: string) => keyOf(bogotaParts(new Date(iso)));

export const todayKey = () => keyOf(bogotaParts(new Date()));

export const daysFromToday = (key: string) => Math.round((dateOfKey(key).getTime() - dateOfKey(todayKey()).getTime()) / DAY_MS);

export const monthOf = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
};

export const timeOf = (iso: string) => formatTime(new Date(iso));

export function dayTitle(key: string): string {
  const diff = daysFromToday(key);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const label = longDay.format(dateOfKey(key));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function counterpartOf(a: Appointment): { nombre: string; fotoUrl: string | null } {
  return a.prestador ?? a.cliente ?? { nombre: '—', fotoUrl: null };
}

export function groupByDay(list: Appointment[]): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const a of list) {
    const key = dayKeyOf(a.fechaHora);
    map.set(key, [...(map.get(key) ?? []), a]);
  }
  return map;
}
