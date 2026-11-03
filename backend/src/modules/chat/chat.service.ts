import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import type { RequestState } from '../contracting/contracting.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { READ_ONLY_STATES, THREAD_LIMIT } from './chat.constants';

type Db = PrismaService | Prisma.TransactionClient;

const NOT_FOUND = 'La contratación no existe.';

const PERSON = { first_name: true, last_name: true, profile_photo_url: true } satisfies Prisma.usersSelect;

const ACCESS_SELECT = {
  client_id: true,
  provider_profiles: { select: { user_id: true } },
  request_statuses: { select: { status_name: true } },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
} satisfies Prisma.service_requestsSelect;

const LIST_SELECT = {
  service_request_id: true,
  client_id: true,
  provider_profile_id: true,
  proposed_datetime: true,
  request_statuses: { select: { status_name: true } },
  provider_profiles: { select: { users: { select: PERSON } } },
  users: { select: PERSON },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
  appointments: { select: { scheduled_datetime: true } },
} satisfies Prisma.service_requestsSelect;

const MESSAGE_SELECT = {
  message_id: true,
  sender_id: true,
  message_text: true,
  sent_at: true,
} satisfies Prisma.chat_messagesSelect;

type MessageRow = Prisma.chat_messagesGetPayload<{ select: typeof MESSAGE_SELECT }>;
type Person = Prisma.usersGetPayload<{ select: typeof PERSON }>;

export interface ChatAccess {
  /** La otra parte: a quien se avisa de un mensaje nuevo y de quien se muestra el "Visto". */
  otherUserId: bigint;
  estado: RequestState;
  soloLectura: boolean;
  titulo: string;
}

/** Un mensaje en la API, visto por quien lo pide (`mio`). */
export interface ChatMessage {
  id: string;
  texto: string;
  fecha: string;
  mio: boolean;
}

const toMessage = (userId: bigint, m: MessageRow): ChatMessage => ({
  id: String(m.message_id),
  texto: m.message_text,
  fecha: m.sent_at.toISOString(),
  mio: m.sender_id === userId,
});

const fullName = (u: Person) => `${u.first_name} ${u.last_name}`;

const readOnly = () =>
  apiError(HttpStatus.CONFLICT, 'CHAT_READ_ONLY', 'Esta contratación ya terminó: su chat es de solo lectura.');

/** Si el estado cambia entre la revisión y el INSERT, la base lo frena (D-53); aquí sale el mismo error legible. */
const DB_RULES: [string, () => HttpException][] = [
  ['es de solo lectura', readOnly],
  ['Solo las partes de la contratación', () => new NotFoundException(NOT_FOUND)],
];

const translateDbRule = (err: unknown) => {

  if (err instanceof HttpException || !(err instanceof Error)) return err;
  const rule = DB_RULES.find(([fragment]) => err.message.includes(fragment));
  return rule ? rule[1]() : err;
};

/**
 * HU-42 · Chat de una contratación. Solo lo ven y escriben sus dos partes, desde SOLICITADO; en RECHAZADO,
 * CANCELADO y COMPLETADO queda de solo lectura (D-53). La base revisa lo mismo al guardar (fn_check_chat_message).
 * Lo leído se guarda en chat_reads: de ahí salen los sin leer y el "Visto" de la otra parte.
 */
@Injectable()
export class ChatService {

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  /** A quien no es parte se le responde 404, sin revelar que la contratación existe (como HU-38.7). */
  async access(userId: bigint, requestId: bigint, db: Db = this.prisma): Promise<ChatAccess> {

    const r = await db.service_requests.findUnique({ where: { service_request_id: requestId }, select: ACCESS_SELECT });

    if (!r) throw new NotFoundException(NOT_FOUND);

    const providerUserId = r.provider_profiles.user_id;

    if (userId !== r.client_id && userId !== providerUserId) throw new NotFoundException(NOT_FOUND);

    const estado = r.request_statuses.status_name as RequestState;

    return {
      otherUserId: userId === r.client_id ? providerUserId : r.client_id,
      estado,
      soloLectura: READ_ONLY_STATES.includes(estado),
      titulo: r.service_listings?.title ?? r.needs?.title ?? 'el servicio',
    };
  }

  /**
   * Una conversación por contratación del perfil activo (como HU-12): primero las que tienen mensajes, de la más
   * reciente a la más antigua. Tres consultas en total, sin importar cuántas contrataciones haya.
   */
  async mine(user: AuthUser) {

    const asClient = user.activeProfile === 'client';

    const rows = await this.prisma.service_requests.findMany({
      where: asClient ? { client_id: user.userId } : { provider_profiles: { user_id: user.userId } },
      orderBy: [{ created_at: 'desc' }, { service_request_id: 'desc' }],
      select: LIST_SELECT,
    });

    if (!rows.length) return [];

    const ids = rows.map((r) => r.service_request_id);

    const [last, unread] = await Promise.all([
      this.prisma.$queryRaw<{ service_request_id: bigint; sender_id: bigint; message_text: string; sent_at: Date }[]>`
        SELECT DISTINCT ON (service_request_id) service_request_id, sender_id, message_text, sent_at
        FROM chat_messages
        WHERE service_request_id = ANY(${ids}::bigint[])
        ORDER BY service_request_id, message_id DESC`,
      this.prisma.$queryRaw<{ service_request_id: bigint; total: number }[]>`
        SELECT m.service_request_id, count(*)::int AS total
        FROM chat_messages m
        LEFT JOIN chat_reads r ON r.service_request_id = m.service_request_id AND r.user_id = ${user.userId}
        WHERE m.service_request_id = ANY(${ids}::bigint[])
          AND m.sender_id <> ${user.userId}
          AND (r.last_read_at IS NULL OR m.sent_at > r.last_read_at)
        GROUP BY m.service_request_id`,
    ]);

    const lastBy = new Map(last.map((m) => [m.service_request_id, m]));
    const unreadBy = new Map(unread.map((u) => [u.service_request_id, u.total]));

    const list = rows.map((r) => {

      const estado = r.request_statuses.status_name as RequestState;
      const m = lastBy.get(r.service_request_id);
      const other = asClient ? r.provider_profiles.users : r.users;

      return {
        contratacionId: String(r.service_request_id),
        servicio: r.service_listings?.title ?? r.needs?.title ?? 'Servicio',
        estado,
        fechaHora: (r.appointments?.scheduled_datetime ?? r.proposed_datetime).toISOString(),
        contraparte: {
          id: asClient ? `p${r.provider_profile_id}` : `c${r.client_id}`,
          nombre: fullName(other),
          fotoUrl: this.storage.publicUrl(other.profile_photo_url),
        },
        ultimoMensaje: m ? { texto: m.message_text, fecha: m.sent_at.toISOString(), mio: m.sender_id === user.userId } : null,
        sinLeer: unreadBy.get(r.service_request_id) ?? 0,
        soloLectura: READ_ONLY_STATES.includes(estado),
      };
    });

    return list.sort((a, b) =>
      (b.ultimoMensaje?.fecha ?? '').localeCompare(a.ultimoMensaje?.fecha ?? '') || a.fechaHora.localeCompare(b.fechaHora));
  }

  /** La conversación, del mensaje más antiguo al más reciente (los últimos THREAD_LIMIT), y el "Visto" de la otra parte. */
  async thread(userId: bigint, requestId: bigint) {

    const chat = await this.access(userId, requestId);

    const [rows, otherRead] = await Promise.all([
      this.prisma.chat_messages.findMany({
        where: { service_request_id: requestId },
        // Por id: crece siempre y no se repite, a diferencia de la fecha
        orderBy: { message_id: 'desc' },
        take: THREAD_LIMIT,
        select: MESSAGE_SELECT,
      }),
      this.prisma.chat_reads.findUnique({
        where: { service_request_id_user_id: { service_request_id: requestId, user_id: chat.otherUserId } },
        select: { last_read_at: true },
      }),
    ]);

    return {
      soloLectura: chat.soloLectura,
      mensajes: rows.reverse().map((m) => toMessage(userId, m)),
      leidoPorContraparte: otherRead?.last_read_at.toISOString() ?? null,
    };
  }

  /** Guarda el mensaje y avisa a la otra parte, en una sola transacción. Quien escribe ya leyó lo anterior. */
  async send(userId: bigint, requestId: bigint, texto: string): Promise<ChatMessage> {

    return this.prisma.$transaction(async (tx) => {

      const chat = await this.access(userId, requestId, tx);

      if (chat.soloLectura) throw readOnly();

      const saved = await tx.chat_messages.create({
        data: { service_request_id: requestId, sender_id: userId, message_text: texto },
        select: MESSAGE_SELECT,
      });

      await this.touchRead(tx, userId, requestId);
      await this.notifyOnce(tx, chat, requestId);

      return toMessage(userId, saved);
    }).catch((err) => { throw translateDbRule(err); });
  }

  /** HU-42 y HU-62: lo leído avanza hasta ahora y el aviso de mensajes nuevos de este chat queda leído. */
  async markRead(userId: bigint, requestId: bigint) {

    await this.access(userId, requestId);

    await this.prisma.$transaction(async (tx) => {

      await this.touchRead(tx, userId, requestId);

      await tx.notifications.updateMany({
        where: {
          user_id: userId,
          related_service_request_id: requestId,
          is_read: false,
          notification_types: { type_name: 'new_chat_message' },
        },
        data: { is_read: true },
      });
    });
  }

  /** Solo avanza: con dos pestañas abiertas, la que llega tarde no devuelve la marca hacia atrás. Usa el reloj de la base, como sent_at. */
  private async touchRead(tx: Prisma.TransactionClient, userId: bigint, requestId: bigint) {

    await tx.$executeRaw`
      INSERT INTO chat_reads (service_request_id, user_id, last_read_at)
      VALUES (${requestId}, ${userId}, now())
      ON CONFLICT (service_request_id, user_id)
      DO UPDATE SET last_read_at = GREATEST(chat_reads.last_read_at, EXCLUDED.last_read_at)`;
  }

  /** HU-62: un aviso por conversación sin leer, no uno por mensaje (diez mensajes seguidos dan un aviso). */
  private async notifyOnce(tx: Prisma.TransactionClient, chat: ChatAccess, requestId: bigint) {

    const pending = await tx.notifications.findFirst({
      where: {
        user_id: chat.otherUserId,
        related_service_request_id: requestId,
        is_read: false,
        notification_types: { type_name: 'new_chat_message' },
      },
      select: { notification_id: true },
    });

    if (pending) return;

    await this.notifications.notify([{
      userId: chat.otherUserId,
      type: 'new_chat_message',
      message: `Tienes mensajes nuevos sobre ${chat.titulo}.`,
      serviceRequestId: requestId,
    }], tx);
  }
}
