import { NotificationApi } from '../models/notification.models';

const TIME_ZONE = 'America/Bogota';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const time = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const shortDay = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });

export function daysAgo(date: Date, now = new Date()): number {
  const [a, b] = [now, date].map((d) => Date.parse(`${dayKey.format(d)}T00:00:00Z`));
  return Math.round((a - b) / 86_400_000);
}

export function relativeTime(value: string): string {
  const date = new Date(value);
  const min = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const ago = daysAgo(date);
  if (ago === 0) return `Hace ${Math.floor(min / 60)} h`;
  if (ago === 1) return `Ayer, ${time.format(date)}`;
  return shortDay.format(date).replace(/\./g, '');
}

export function notificationLink(n: NotificationApi, base: string): string[] {
  // El perfil profesional muestra el estado de la verificación
  if (n.tipo === 'verificacion') return ['/prestador/perfil'];
  if (n.tipo === 'reclamo') return n.reclamoId ? [base, 'reclamos', n.reclamoId] : [base, 'reclamos'];
  if (n.necesidadId) return [base, 'necesidades', n.necesidadId];
  if (n.contratacionId) return [base, n.tipo === 'mensaje' ? 'mensajes' : 'contrataciones', n.contratacionId];
  return [base, 'notificaciones'];
}
