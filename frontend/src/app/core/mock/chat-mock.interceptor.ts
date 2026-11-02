import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { ContractStatus } from '../../features/contracting/models/contract';
import { ConversationApi, MAX_MESSAGE_LENGTH, MessageApi, ThreadApi, isReadOnly } from '../../features/chat/models/chat.models';

// Simula el chat de la E7 (HU-42) mientras el backend no lo tenga (mockApi).
// La otra parte responde sola unos segundos después de cada mensaje, para probar la llegada de mensajes.

type Role = 'cliente' | 'prestador';

interface StoredMessage {
  id: string;
  texto: string;
  fecha: string;
  autor: Role;
}

interface Chat {
  mensajes: StoredMessage[];
  leido: Partial<Record<Role, string>>;
}

const KEY = 'confiance.mock.chats';
const REPLY_MS = 5000;
const TYPING_MS = 3500;
const api = environment.apiUrl;
const DETAIL_TTL_MS = 30_000;
const details = new Map<string, { at: number; rol: Role; estado: ContractStatus }>();

const REPLIES: Record<Role, string[]> = {
  prestador: [
    '¡Hola! Recibido, ya lo tengo en cuenta.',
    'Perfecto, nos vemos a la hora acordada.',
    'Listo, cualquier cambio te escribo por aquí.',
  ],
  cliente: ['Gracias, quedo atento.', 'Perfecto, te espero.', 'Listo, muchas gracias por avisar.'],
};

function read(): Record<string, Chat> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function write(store: Record<string, Chat>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Sin almacenamiento el simulador funciona igual, solo que se reinicia al recargar
  }
}

const other = (role: Role): Role => (role === 'cliente' ? 'prestador' : 'cliente');

const visible = (chat: Chat | undefined, now = Date.now()) =>
  (chat?.mensajes ?? []).filter((m) => new Date(m.fecha).getTime() <= now);

const toMessage = (m: StoredMessage, role: Role): MessageApi => ({ id: m.id, texto: m.texto, fecha: m.fecha, mio: m.autor === role });

function unread(chat: Chat | undefined, role: Role): number {
  const since = chat?.leido[role] ?? '';
  return visible(chat).filter((m) => m.autor !== role && m.fecha > since).length;
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const chatMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];

  if (path === '/chats/mine' && req.method === 'GET') {
    type Item = { id: string; servicio: string; estado: ContractStatus; fechaHora: string; prestador?: ConversationApi['contraparte'] & { id: string }; cliente?: ConversationApi['contraparte'] };
    return responses(next(new HttpRequest('GET', `${api}/contracts/mine`, { withCredentials: true }))).pipe(
      switchMap((res) => {
        const store = read();
        const list = (res.body!.data as Item[]).map((c): ConversationApi => {
          const role: Role = c.prestador ? 'cliente' : 'prestador';
          const last = visible(store[c.id]).at(-1);
          return {
            contratacionId: c.id,
            servicio: c.servicio,
            estado: c.estado,
            fechaHora: c.fechaHora,
            contraparte: c.prestador ?? c.cliente ?? { nombre: '—', fotoUrl: null },
            ultimoMensaje: last ? { texto: last.texto, fecha: last.fecha, mio: last.autor === role } : null,
            sinLeer: unread(store[c.id], role),
            soloLectura: isReadOnly(c.estado),
          };
        });
        // Primero las que tienen mensajes, de la más reciente a la más antigua
        list.sort((a, b) => (b.ultimoMensaje?.fecha ?? '').localeCompare(a.ultimoMensaje?.fecha ?? '') || a.fechaHora.localeCompare(b.fechaHora));
        return ok(list, req.url);
      }),
    );
  }

  const m = path.match(/^\/contracts\/(\d+)\/messages(\/read)?$/);
  if (!m) return next(req);
  const [, id, markRead] = m;

  // El sondeo de la conversación no vuelve a pedir el detalle en cada vuelta (límite de 100 peticiones por minuto)
  const cached = details.get(id);
  const contract$ =
    req.method === 'GET' && cached && Date.now() - cached.at < DETAIL_TTL_MS
      ? of(cached)
      : responses(next(new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true }))).pipe(
          map((res) => {
            const d = res.body!.data as ContractDetailApi;
            const entry = { at: Date.now(), rol: d.rol as Role, estado: d.estado };
            details.set(id, entry);
            return entry;
          }),
        );

  return contract$.pipe(
    switchMap((detail) => {
      const role = detail.rol;
      const readOnly = isReadOnly(detail.estado);
      const store = read();
      const chat: Chat = store[id] ?? { mensajes: [], leido: {} };
      const now = Date.now();

      if (req.method === 'GET' && !markRead) {
        const thread: ThreadApi = {
          soloLectura: readOnly,
          mensajes: visible(chat, now).map((x) => toMessage(x, role)),
          leidoPorContraparte: chat.leido[other(role)] ?? null,
          escribiendo: chat.mensajes.some((x) => {
            const left = new Date(x.fecha).getTime() - now;
            return x.autor !== role && left > 0 && left <= TYPING_MS;
          }),
        };
        return ok(thread, req.url);
      }

      if (req.method === 'POST' && markRead) {
        chat.leido[role] = new Date(now).toISOString();
        store[id] = chat;
        write(store);
        return ok({}, req.url);
      }

      if (req.method === 'POST') {
        const text = String((req.body as { texto?: string })?.texto ?? '').trim();
        if (readOnly) return fail(409, 'CHAT_READ_ONLY', 'Esta conversación es de solo lectura.', req.url);
        if (!text || text.length > MAX_MESSAGE_LENGTH) return fail(400, 'VALIDATION_ERROR', 'El mensaje debe tener entre 1 y 2000 caracteres.', req.url);
        const sent: StoredMessage = { id: `${now}`, texto: text, fecha: new Date(now).toISOString(), autor: role };
        chat.mensajes.push(sent);
        chat.leido[role] = sent.fecha;
        const replier = other(role);
        if (!chat.mensajes.some((x) => x.autor === replier && new Date(x.fecha).getTime() > now)) {
          const said = chat.mensajes.filter((x) => x.autor === replier).length;
          chat.mensajes.push({
            id: `${now + 1}`,
            texto: REPLIES[replier][said % REPLIES[replier].length],
            fecha: new Date(now + REPLY_MS).toISOString(),
            autor: replier,
          });
        }
        store[id] = chat;
        write(store);
        return ok(toMessage(sent, role), req.url);
      }

      return next(req);
    }),
  );
};
