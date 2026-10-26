import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, filter, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { NotificationApi, NotificationType } from '../../features/notifications/models/notification.models';
import { CurrentUserService } from '../services/current-user.service';

// La bandeja es la real (GET /notifications/mine). Mientras pagos, reagendamiento, cancelación y chat sigan simulados
// (mockApi), sus avisos no llegan a la tabla: este simulador los agrega a la respuesta con ids 'sim:' a partir de lo que
// guardan los otros simuladores en localStorage, sin hacer peticiones extra.

type Role = 'cliente' | 'prestador';
type Overlay = Pick<ContractDetailApi, 'etapas' | 'reagendamientos'> & { pago?: ContractDetailApi['pago'] };
type Names = Record<Role, Record<string, { servicio: string; contraparte: string }>>;

interface ChatMessage {
  id: string;
  texto: string;
  fecha: string;
  autor: Role;
}

const READ_KEY = 'confiance.mock.notifications';
const NAMES_KEY = 'confiance.mock.contractNames';
const CONTRACTS_KEY = 'confiance.mock.contracts';
const CHATS_KEY = 'confiance.mock.chats';
const FRESH_MS = 3 * 24 * 3_600_000;
const PREFIX = 'sim:';
const api = environment.apiUrl;

const longDate = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

// Mismos títulos fijos por tipo que el backend (notifications.constants.ts)
const TITLE = {
  request_cancelled: 'Contratación cancelada',
  completion_requested: 'El servicio quedó finalizado',
  service_started: 'El servicio comenzó',
  request_completed: 'Contratación completada',
  new_chat_message: 'Mensaje nuevo',
  reschedule_requested: 'Proponen un nuevo horario',
  reschedule_answered: 'Respondieron tu propuesta de horario',
  payment_approved: 'Pago aprobado',
  payment_rejected: 'Pago rechazado',
  transfer_marked: 'Transferencia marcada como hecha',
  transfer_confirmed: 'Transferencia confirmada',
  transfer_not_received: 'Transferencia no recibida',
};

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento el simulador funciona igual, solo que se reinicia al recargar
  }
}

/** Guarda el servicio y la contraparte de cada contratación que pasa por las listas, para redactar los avisos. */
function remember(role: Role, list: { id?: string; contratacionId?: string; servicio: string; prestador?: { nombre: string }; cliente?: { nombre: string }; contraparte?: { nombre: string } }[]): void {
  const names = load<Names>(NAMES_KEY, { cliente: {}, prestador: {} });
  for (const c of list) {
    const id = c.contratacionId ?? c.id;
    const other = c.contraparte?.nombre ?? c.prestador?.nombre ?? c.cliente?.nombre;
    if (id && other) names[role][id] = { servicio: c.servicio, contraparte: other };
  }
  save(NAMES_KEY, names);
}

type Draft = Omit<NotificationApi, 'leida'> & { readByDefault?: boolean };

function simulated(role: Role, now = Date.now()): NotificationApi[] {
  const names = load<Names>(NAMES_KEY, { cliente: {}, prestador: {} })[role];
  const overlays = load<Record<string, Overlay>>(CONTRACTS_KEY, {});
  const chats = load<Record<string, { mensajes: ChatMessage[]; leido: Partial<Record<Role, string>> }>>(CHATS_KEY, {});
  const out: Draft[] = [];

  for (const [id, info] of Object.entries(names)) {
    const add = (key: string, tipo: NotificationType, fecha: string, titulo: string, mensaje: string, readByDefault?: boolean) =>
      out.push({ id: `${PREFIX}${id}:${key}`, tipo, fecha, titulo, mensaje: `${info.servicio}. ${mensaje}`, contratacionId: id, necesidadId: null, readByDefault });
    const o = overlays[id];

    for (const e of o?.etapas ?? []) {
      if (e.actor === role) continue;
      if (e.estado === 'cancelado') add('cancelado', 'cancelacion', e.fecha, TITLE.request_cancelled, `${info.contraparte} canceló la contratación.`);
      if (e.estado === 'en_curso') add('en_curso', 'servicio', e.fecha, TITLE.service_started, `${info.contraparte} inició el servicio.`);
      if (e.estado === 'finalizado') add('finalizado', 'servicio', e.fecha, TITLE.completion_requested, 'Confirma la finalización y realiza el pago.');
      if (e.estado === 'completado') add('completado', 'contratacion', e.fecha, TITLE.request_completed, `Ya puedes calificar a ${info.contraparte}.`);
    }

    (o?.reagendamientos ?? []).forEach((r, i) => {
      const when = longDate.format(new Date(r.fechaNueva));
      if (r.pedidoPor !== role && r.estado === 'pendiente') add(`reagendar${i}`, 'reagendamiento', r.creado, TITLE.reschedule_requested, `Nueva fecha propuesta: ${when}`);
      if (r.pedidoPor === role && r.estado !== 'pendiente') {
        add(`reagendar${i}:${r.estado}`, 'reagendamiento', r.creado, TITLE.reschedule_answered, r.estado === 'aceptado' ? `Aceptaron el nuevo horario: ${when}` : 'Rechazaron el nuevo horario; se mantiene el anterior.');
      }
    });

    (o?.pago?.intentos ?? []).forEach((p, i) => {
      const key = `pago${i}:${p.estado}`;
      if (role === 'cliente') {
        if (p.metodo === 'pse' && p.estado === 'pagado') add(key, 'pago', p.fecha, TITLE.payment_approved, 'Tu pago quedó registrado.');
        if (p.metodo === 'pse' && p.estado === 'rechazado') add(key, 'pago', p.fecha, TITLE.payment_rejected, 'Intenta de nuevo o paga por transferencia.');
        if (p.metodo === 'transferencia' && p.estado === 'pagado') add(key, 'pago', p.fecha, TITLE.transfer_confirmed, `${info.contraparte} confirmó tu transferencia.`);
        if (p.metodo === 'transferencia' && p.estado === 'rechazado') add(key, 'pago', p.fecha, TITLE.transfer_not_received, `${info.contraparte} no recibió tu transferencia.`);
      } else if (p.metodo === 'transferencia' && p.estado === 'pendiente_confirmacion') {
        add(key, 'pago', p.fecha, TITLE.transfer_marked, 'Revisa tu cuenta y confirma si la recibiste.');
      } else if (p.metodo === 'pse' && p.estado === 'pagado') {
        add(key, 'pago', p.fecha, TITLE.payment_approved, `${info.contraparte} pagó por PSE.`);
      }
    });

    const chat = chats[id];
    const incoming = (chat?.mensajes ?? []).filter((m) => m.autor !== role && new Date(m.fecha).getTime() <= now);
    const last = incoming.at(-1);
    if (last) {
      const unread = incoming.filter((m) => m.fecha > (chat.leido[role] ?? '')).length;
      out.push({
        id: `${PREFIX}${id}:mensaje:${last.id}`,
        tipo: 'mensaje',
        fecha: last.fecha,
        titulo: TITLE.new_chat_message,
        mensaje: `${info.contraparte}: ${last.texto}`,
        contratacionId: id,
        necesidadId: null,
        readByDefault: !unread,
      });
    }
  }

  const read = load<Record<string, boolean>>(READ_KEY, {});
  return out.map(({ readByDefault, ...n }): NotificationApi => ({ ...n, leida: read[n.id] ?? readByDefault ?? now - new Date(n.fecha).getTime() > FRESH_MS }));
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const notificationsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];
  const role: Role = inject(CurrentUserService).current()?.perfilActivo === 'provider' ? 'prestador' : 'cliente';

  if ((path === '/contracts/mine' || path === '/chats/mine') && req.method === 'GET') {
    return next(req).pipe(
      tap((e) => {
        if (e instanceof HttpResponse) remember(role, ((e.body as { data?: unknown[] })?.data ?? []) as Parameters<typeof remember>[1]);
      }),
    );
  }

  if (path === '/notifications/mine' && req.method === 'GET') {
    return responses(next(req)).pipe(
      map((res) => {
        const list = [...(res.body!.data as NotificationApi[]), ...simulated(role)].sort((a, b) => b.fecha.localeCompare(a.fecha));
        return res.clone({ body: { ...res.body!, data: list } });
      }),
    );
  }

  if (path === '/notifications/read-all' && req.method === 'POST') {
    const read = load<Record<string, boolean>>(READ_KEY, {});
    for (const n of simulated(role)) read[n.id] = true;
    save(READ_KEY, read);
    return next(req);
  }

  const m = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (m && req.method === 'POST') {
    const id = decodeURIComponent(m[1]);
    if (!id.startsWith(PREFIX)) return next(req);
    const read = load<Record<string, boolean>>(READ_KEY, {});
    read[id] = (req.body as { leida?: boolean } | null)?.leida !== false;
    save(READ_KEY, read);
    return ok({}, req.url);
  }

  return next(req);
};
