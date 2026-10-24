import { HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { NotificationApi, NotificationType } from '../../features/notifications/models/notification.models';

// Simula las notificaciones de la HU-62 mientras el backend no las tenga (mockApi).
// Se arman con lo que ya existe: las etapas, reagendamientos y pagos de cada contratación, el chat y las citas próximas.

type Role = 'cliente' | 'prestador';

interface Store {
  read: Record<string, boolean>;
}

interface ChatMessage {
  id: string;
  texto: string;
  fecha: string;
  autor: Role;
}

const KEY = 'confiance.mock.notifications';
const CHATS_KEY = 'confiance.mock.chats';
const HOUR = 3_600_000;
const FRESH_MS = 3 * 24 * HOUR;
const api = environment.apiUrl;

const longDate = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const timeOnly = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback;
  } catch {
    return fallback;
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Sin almacenamiento el simulador funciona igual, solo que se reinicia al recargar
  }
}

type Draft = Omit<NotificationApi, 'leida'> & { readByDefault?: boolean };

function fromContract(d: ContractDetailApi, chats: Record<string, { mensajes: ChatMessage[]; leido: Partial<Record<Role, string>> }>, now: number): Draft[] {
  const role = d.rol as Role;
  const other = role === 'cliente' ? d.prestador.nombre : d.cliente.nombre;
  const out: Draft[] = [];
  const add = (key: string, tipo: NotificationType, fecha: string, titulo: string, mensaje: string, readByDefault?: boolean) =>
    out.push({ id: `${d.id}:${key}`, tipo, fecha, titulo, mensaje, contratacionId: d.id, readByDefault });

  for (const e of d.etapas) {
    if (e.actor === role) continue;
    const at = e.fecha;
    switch (e.estado) {
      case 'solicitado':
        add('solicitado', 'solicitud', at, `Nueva solicitud de ${other}`, `${d.servicio}. Revísala y responde lo antes posible.`);
        break;
      case 'aceptado':
        add('aceptado', 'solicitud', at, `${other} aceptó tu solicitud`, `${d.servicio}. Confirma la contratación para agendar el servicio.`);
        break;
      case 'rechazado':
        add('rechazado', 'solicitud', at, `${other} rechazó tu solicitud`, `${d.servicio}. Puedes buscar otro prestador para tu servicio.`);
        break;
      case 'confirmado':
        add('confirmado', 'contratacion', at, `${other} confirmó la contratación`, `${d.servicio}. La cita ya está en tu agenda.`);
        break;
      case 'en_curso':
        add('en_curso', 'servicio', at, `${other} inició el servicio`, d.servicio);
        break;
      case 'finalizado':
        add('finalizado', 'servicio', at, `${other} finalizó el servicio`, `${d.servicio}. Confirma la finalización y realiza el pago.`);
        break;
      case 'completado':
        add('completado', 'contratacion', at, 'La contratación quedó completada', `${d.servicio}. Ya puedes calificar a ${other}.`);
        break;
      case 'cancelado':
        if (e.actor === 'sistema') add('cancelado', 'cancelacion', at, 'La contratación se canceló automáticamente', `${d.servicio}. Venció el plazo para responder.`);
        else add('cancelado', 'cancelacion', at, `${other} canceló la contratación`, d.servicio);
        break;
    }
  }

  d.reagendamientos.forEach((r, i) => {
    const when = longDate.format(new Date(r.fechaNueva));
    if (r.pedidoPor !== role && r.estado === 'pendiente') {
      add(`reagendar${i}`, 'reagendamiento', r.creado, `${other} propone un nuevo horario`, `Acéptalo o recházalo. ${d.servicio}: ${when}`);
    } else if (r.pedidoPor === role && r.estado !== 'pendiente') {
      const ok = r.estado === 'aceptado';
      add(`reagendar${i}:${r.estado}`, 'reagendamiento', r.creado, `${other} ${ok ? 'aceptó' : 'rechazó'} el nuevo horario`, ok ? `${d.servicio}: ${when}` : `${d.servicio}. Se mantiene el horario anterior.`);
    }
  });

  (d.pago?.intentos ?? []).forEach((p, i) => {
    const key = `pago${i}:${p.estado}`;
    if (role === 'cliente') {
      if (p.metodo === 'pse' && p.estado === 'pagado') add(key, 'pago', p.fecha, 'Pago PSE aprobado', `${d.servicio}. Tu pago quedó registrado.`);
      if (p.metodo === 'pse' && p.estado === 'rechazado') add(key, 'pago', p.fecha, 'El pago PSE fue rechazado', `${d.servicio}. Puedes intentarlo de nuevo o pagar por transferencia.`);
      if (p.metodo === 'transferencia' && p.estado === 'pagado') add(key, 'pago', p.fecha, `${other} confirmó tu transferencia`, `${d.servicio}. El pago quedó registrado.`);
      if (p.metodo === 'transferencia' && p.estado === 'rechazado') add(key, 'pago', p.fecha, `${other} no recibió tu transferencia`, `${d.servicio}. Revisa el comprobante o paga por PSE.`);
    } else {
      if (p.metodo === 'transferencia' && p.estado === 'pendiente_confirmacion') add(key, 'pago', p.fecha, `${other} marcó la transferencia como hecha`, `${d.servicio}. Revisa tu cuenta y confirma si la recibiste.`);
      if (p.metodo === 'pse' && p.estado === 'pagado') add(key, 'pago', p.fecha, `Recibiste el pago de ${other}`, `${d.servicio}. Pagó por PSE.`);
    }
  });

  const start = new Date(d.fechaHora).getTime();
  if (d.estado === 'confirmado' && start > now && start - now <= 24 * HOUR) {
    const confirmed = [...d.etapas].reverse().find((e) => e.estado === 'confirmado')?.fecha ?? '';
    const at = new Date(Math.max(start - 24 * HOUR, new Date(confirmed).getTime() || 0)).toISOString();
    const today = dayKey.format(new Date(start)) === dayKey.format(new Date(now));
    add('recordatorio', 'recordatorio', at, `Recordatorio: tu servicio es ${today ? 'hoy' : 'mañana'}`, `${d.servicio}, a las ${timeOnly.format(new Date(start))}`);
  }

  const chat = chats[d.id];
  const incoming = (chat?.mensajes ?? []).filter((m) => m.autor !== role && new Date(m.fecha).getTime() <= now);
  const last = incoming.at(-1);
  if (last) {
    const since = chat.leido[role] ?? '';
    const unread = incoming.filter((m) => m.fecha > since).length;
    out.push({
      id: `${d.id}:mensaje:${last.id}`,
      tipo: 'mensaje',
      fecha: last.fecha,
      titulo: unread > 1 ? `${unread} mensajes nuevos de ${other}` : `Mensaje nuevo de ${other}`,
      mensaje: last.texto,
      contratacionId: d.id,
      readByDefault: !unread,
    });
  }
  return out;
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const notificationsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];
  if (!path.startsWith('/notifications/')) return next(req);

  const build = (): Observable<NotificationApi[]> =>
    responses(next(new HttpRequest('GET', `${api}/contracts/mine`, { withCredentials: true }))).pipe(
      switchMap((res) => {
        const ids = (res.body!.data as { id: string }[]).map((c) => c.id);
        if (!ids.length) return of([] as ContractDetailApi[]);
        return forkJoin(
          ids.map((id) =>
            responses(next(new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true }))).pipe(map((r) => r.body!.data as ContractDetailApi)),
          ),
        );
      }),
      map((details) => {
        const now = Date.now();
        const store = load<Store>(KEY, { read: {} });
        const chats = load(CHATS_KEY, {});
        return details
          .flatMap((d) => fromContract(d, chats, now))
          .map(({ readByDefault, ...n }): NotificationApi => ({
            ...n,
            leida: store.read[n.id] ?? readByDefault ?? now - new Date(n.fecha).getTime() > FRESH_MS,
          }))
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
      }),
    );

  if (path === '/notifications/mine' && req.method === 'GET') {
    return build().pipe(switchMap((list) => ok(list, req.url)));
  }

  if (path === '/notifications/read-all' && req.method === 'POST') {
    return build().pipe(
      switchMap((list) => {
        const store = load<Store>(KEY, { read: {} });
        for (const n of list) store.read[n.id] = true;
        save(store);
        return ok({}, req.url);
      }),
    );
  }

  const m = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (m && req.method === 'POST') {
    const store = load<Store>(KEY, { read: {} });
    store.read[decodeURIComponent(m[1])] = (req.body as { leida?: boolean })?.leida !== false;
    save(store);
    return ok({}, req.url);
  }

  return next(req);
};
