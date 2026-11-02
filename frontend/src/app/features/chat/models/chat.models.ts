import { ContractStatus } from '../../contracting/models/contract';

export const MAX_MESSAGE_LENGTH = 2000;

export interface ConversationApi {
  contratacionId: string;
  servicio: string;
  estado: ContractStatus;
  fechaHora: string;
  contraparte: { id?: string; nombre: string; fotoUrl: string | null };
  ultimoMensaje: { texto: string; fecha: string; mio: boolean } | null;
  sinLeer: number;
  soloLectura: boolean;
}

export interface MessageApi {
  id: string;
  texto: string;
  fecha: string;
  mio: boolean;
}

export interface ThreadApi {
  soloLectura: boolean;
  mensajes: MessageApi[];
  leidoPorContraparte: string | null;
  escribiendo?: boolean;
}

export const isReadOnly = (status: ContractStatus): boolean =>
  status === 'rechazado' || status === 'cancelado' || status === 'completado';

export interface ChatGroup {
  key: string;
  contraparte: ConversationApi['contraparte'];
  threads: ConversationApi[];
  latest: ConversationApi;
  sinLeer: number;
  soloLectura: boolean;
}

export const personKey = (c: ConversationApi): string => c.contraparte.id ?? `${c.contraparte.nombre}|${c.contraparte.fotoUrl ?? ''}`;

export const byRelevance = (a: ConversationApi, b: ConversationApi): number =>
  Number(a.soloLectura) - Number(b.soloLectura) ||
  (a.soloLectura ? b.fechaHora.localeCompare(a.fechaHora) : a.fechaHora.localeCompare(b.fechaHora));

export function groupByPerson(list: ConversationApi[]): ChatGroup[] {
  const groups = new Map<string, ChatGroup>();
  for (const c of list) {
    const key = personKey(c);
    const g = groups.get(key) ?? { key, contraparte: c.contraparte, threads: [], latest: c, sinLeer: 0, soloLectura: true };
    g.threads.push(c);
    if ((c.ultimoMensaje?.fecha ?? '') > (g.latest.ultimoMensaje?.fecha ?? '')) g.latest = c;
    g.sinLeer += c.sinLeer;
    g.soloLectura &&= c.soloLectura;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, threads: [...g.threads].sort(byRelevance) }));
}
