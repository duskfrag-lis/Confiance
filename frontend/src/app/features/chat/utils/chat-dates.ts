const TIME_ZONE = 'America/Bogota';

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const time = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, weekday: 'short' });
const shortDay = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });
const longDayYear = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const keyOfDay = (date: Date): string => dayKey.format(date);

function daysAgo(date: Date): number {
  const [a, b] = [keyOfDay(new Date()), keyOfDay(date)].map((k) => Date.parse(`${k}T00:00:00Z`));
  return Math.round((a - b) / 86_400_000);
}

export const messageTime = (date: Date): string => time.format(date);

export function listTime(value: string): string {
  const date = new Date(value);
  const ago = daysAgo(date);
  if (ago <= 0) return time.format(date);
  if (ago === 1) return 'Ayer';
  if (ago < 7) return weekday.format(date).replace('.', '');
  return shortDay.format(date).replace('.', '');
}

export function dayLabel(date: Date): string {
  const ago = daysAgo(date);
  if (ago === 0) return 'Hoy';
  if (ago === 1) return 'Ayer';
  const label = keyOfDay(date).slice(0, 4) === keyOfDay(new Date()).slice(0, 4) ? longDay.format(date) : longDayYear.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
