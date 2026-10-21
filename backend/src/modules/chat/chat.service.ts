import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** HU-42.2 (D-53): en estos estados el chat se puede leer pero no escribir. */
export const READ_ONLY_STATES = ['rechazado', 'cancelado', 'completado'];

/** HU-42.4: mensajes por página del historial. */
export const PAGE_SIZE = 50;

const PREVIEW = 80;

export interface ChatMessage {
  id: string;
  contratacionId: string;
  autor: 'cliente' | 'prestador';
  autorId: string;
  texto: string;
  fecha: string;
}

interface Party {
  requestId: bigint;
  clientId: bigint;
  providerUserId: bigint;
  title: string;
  readOnly: boolean;
}

const readOnlyError = () =>
  apiError(HttpStatus.CONFLICT, 'CHAT_READ_ONLY', 'Esta contratación ya terminó: el chat es solo de lectura.');

/**
 * HU-42 · Chat por contratación. Solo las dos partes lo leen y escriben (HU-42.1); la base también lo exige
 * (fn_check_chat_message, D-53). El tiempo real va por ChatGateway; aquí se guarda y se consulta.
 */
@Injectable()
export class ChatService {

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** La contratación si el usuario es una de sus partes; a cualquier otro, 404 sin revelar que existe. */
  async partyOf(userId: bigint, requestId: bigint): Promise<Party> {

    const r = await this.prisma.service_requests.findUnique({
      where: { service_request_id: requestId },
      select: {
        client_id: true,
        request_statuses: { select: { status_name: true } },
        provider_profiles: { select: { user_id: true } },
        service_listings: { select: { title: true } },
        needs: { select: { title: true } },
      },
    });

    if (!r || (r.client_id !== userId && r.provider_profiles.user_id !== userId)) {

      throw new NotFoundException('La contratación no existe.');
    }

    return {
      requestId,
      clientId: r.client_id,
      providerUserId: r.provider_profiles.user_id,
      title: r.service_listings?.title ?? r.needs?.title ?? 'el servicio',
      readOnly: READ_ONLY_STATES.includes(r.request_statuses.status_name),
    };
  }

  /**
   * HU-42.4: el historial completo, por páginas de 50, del más antiguo al más reciente dentro de cada página.
   * `antes` es el id del mensaje más antiguo que el cliente ya tiene.
   */
  async history(userId: bigint, requestId: bigint, before?: bigint) {

    const party = await this.partyOf(userId, requestId);

    const rows = await this.prisma.chat_messages.findMany({
      where: { service_request_id: requestId, ...(before !== undefined && { message_id: { lt: before } }) },
      orderBy: { message_id: 'desc' },
      take: PAGE_SIZE + 1,
    });

    return {
      soloLectura: party.readOnly,
      hayMas: rows.length > PAGE_SIZE,
      mensajes: rows.slice(0, PAGE_SIZE).reverse().map((m) => this.format(m, party)),
    };
  }

  /**
   * HU-42: guarda el mensaje y avisa a la otra parte (HU-42.5) en la misma transacción. En RECHAZADO,
   * CANCELADO o COMPLETADO, 409 CHAT_READ_ONLY (HU-42.2). Si el estado cambia entre la revisión y el
   * guardado, la base lo frena y sale el mismo error.
   */
  async send(userId: bigint, requestId: bigint, text: string): Promise<ChatMessage> {

    const party = await this.partyOf(userId, requestId);

    if (party.readOnly) throw readOnlyError();

    const recipient = userId === party.clientId ? party.providerUserId : party.clientId;

    try {

      return await this.prisma.$transaction(async (tx) => {

        const message = await tx.chat_messages.create({
          data: { service_request_id: requestId, sender_id: userId, message_text: text },
          include: { users: { select: { first_name: true } } },
        });

        const preview = text.length > PREVIEW ? `${text.slice(0, PREVIEW)}…` : text;

        await this.notifications.notify([{
          userId: recipient,
          type: 'new_chat_message',
          message: `${message.users.first_name} te escribió sobre "${party.title}": ${preview}`,
          serviceRequestId: requestId,
        }], tx);

        return this.format(message, party);
      });
    } catch (err) {

      if (err instanceof Error && err.message.includes('es de solo lectura')) throw readOnlyError();
      throw err;
    }
  }

  private format(m: { message_id: bigint; sender_id: bigint; message_text: string; sent_at: Date }, party: Party): ChatMessage {

    return {
      id: String(m.message_id),
      contratacionId: String(party.requestId),
      autor: m.sender_id === party.clientId ? 'cliente' : 'prestador',
      autorId: String(m.sender_id),
      texto: m.message_text,
      fecha: m.sent_at.toISOString(),
    };
  }
}
