const TIME_ZONE = 'America/Bogota';

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const shortDateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const hourOnly = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

export function formatCop(value: number): string {
  return cop.format(value);
}

export function formatShortDateTime(date: Date): string {
  return shortDateTime.format(date);
}

export function bogotaHour(date = new Date()): number {
  return Number(hourOnly.format(date));
}

const longDateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

const timeOnly = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

export function formatLongDateTime(date: Date): string {
  return longDateTime.format(date);
}

export function formatTime(date: Date): string {
  return timeOnly.format(date);
}


export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;

  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

export function bogotaDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-05:00`);
}

export function bogotaParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const local = new Date(date.getTime() - 5 * 3_600_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}
