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
