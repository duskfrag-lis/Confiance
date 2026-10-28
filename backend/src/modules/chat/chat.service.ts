import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestState } from '../contracting/contracting.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PAGE_SIZE, READ_ONLY_STATES } from './chat.constants';
import type { MessagesQuery } from './dto/chat.dto';

type Db = PrismaService | Prisma.TransactionClient;

const NOT_FOUND = 'La contratación no existe.';

const ACCESS_SELECT = {
  client_id: true,
  provider_profiles: { select: { user_id: true } },
  request_statuses: { select: { status_name: true } },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
} satisfies Prisma.service_requestsSelect;

const MESSAGE_SELECT = {
  message_id: true,
  sender_id: true,
  message_text: true,
  sent_at: true,
} satisfies Prisma.chat_messagesSelect;

type MessageRow = Prisma.chat_messagesGetPayload<{ select: typeof MESSAGE_SELECT }>;

export interface ChatAccess {
  clientId: bigint;
  /** La otra parte: a quien se avisa de un mensaje nuevo. */
  otherUserId: bigint;
  estado: RequestState;
  soloLectura: boolean;
  titulo: string;
}

/** Un mensaje en la API. Es igual para las dos partes: el socket le envía el mismo objeto a toda la sala. */
export interface ChatMessage {
  id: string;
  contratacionId: string;
  autor: 'cliente' | 'prestador';
  texto: string;
  enviadoEn: string;
}

const toMessage = (requestId: bigint, clientId: bigint, m: MessageRow): ChatMessage => ({
  id: String(m.message_id),
  contratacionId: String(requestId),
  autor: m.sender_id === clientId ? 'cliente' : 'prestador',
  texto: m.message_text,
  enviadoEn: m.sent_at.toISOString(),
});

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
 */
@Injectable()
export class ChatService {

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** A quien no es parte se le responde 404, sin revelar que la contratación existe (como HU-38.7). */
  async access(userId: bigint, requestId: bigint, db: Db = this.prisma): Promise<ChatAccess> {

    const r = await db.service_requests.findUnique({ where: { service_request_id: requestId }, select: ACCESS_SELECT });

    if (!r) throw new NotFoundException(NOT_FOUND);

    const providerUserId = r.provider_profiles.user_id;

    if (userId !== r.client_id && userId !== providerUserId) throw new NotFoundException(NOT_FOUND);

    const estado = r.request_statuses.status_name as RequestState;

    return {
      clientId: r.client_id,
      otherUserId: userId === r.client_id ? providerUserId : r.client_id,
      estado,
      soloLectura: READ_ONLY_STATES.includes(estado),
      titulo: r.service_listings?.title ?? r.needs?.title ?? 'el servicio',
    };
  }

  /**
   * Una página del historial, del mensaje más antiguo al más reciente. Se pide hacia atrás: sin `antesDe`, los
   * últimos; con `antesDe`, los anteriores a ese id. Se ordena por id porque crece siempre y no se repite.
   */
  async history(userId: bigint, requestId: bigint, query: MessagesQuery) {

    const chat = await this.access(userId, requestId);
    const limit = query.limite ?? PAGE_SIZE;

    const rows = await this.prisma.chat_messages.findMany({
      where: { service_request_id: requestId, ...(query.antesDe && { message_id: { lt: BigInt(query.antesDe) } }) },
      orderBy: { message_id: 'desc' },
      // Una fila de más dice si hay página anterior sin otra consulta
      take: limit + 1,
      select: MESSAGE_SELECT,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();

    return {
      estado: chat.estado,
      soloLectura: chat.soloLectura,
      mensajes: page.map((m) => toMessage(requestId, chat.clientId, m)),
      siguienteCursor: hasMore ? String(page[0].message_id) : null,
    };
  }

  /** Guarda el mensaje y avisa a la otra parte, en una sola transacción. */
  async send(userId: bigint, requestId: bigint, texto: string): Promise<ChatMessage> {

    return this.prisma.$transaction(async (tx) => {

      const chat = await this.access(userId, requestId, tx);

      if (chat.soloLectura) throw readOnly();

      const saved = await tx.chat_messages.create({
        data: { service_request_id: requestId, sender_id: userId, message_text: texto },
        select: MESSAGE_SELECT,
      });

      await this.notifyOnce(tx, chat, requestId);

      return toMessage(requestId, chat.clientId, saved);
    }).catch((err) => { throw translateDbRule(err); });
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
