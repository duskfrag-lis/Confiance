import { UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { roomOf } from './chat.constants';
import { ChatService, type ChatMessage } from './chat.service';
import { SocketAuthService } from './socket-auth.service';

interface RoomBody {
  contratacionId?: unknown;
}

const isId = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);

/**
 * HU-42 en tiempo real. Los mensajes se envían por HTTP (validación, límite y errores como el resto de la API) y
 * aquí solo se reciben: cada contratación es una sala, y solo entra quien es parte.
 */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection {

  @WebSocketServer() server: Namespace;

  constructor(
    private auth: SocketAuthService,
    private chat: ChatService,
  ) {}

  async handleConnection(client: Socket) {

    try {
      await this.auth.authenticate(client);
    } catch {
      client.emit('no_autorizado');
      client.disconnect(true);
    }
  }

  /** Entra a la sala de una contratación. La sesión se revisa otra vez: pudo cerrarse desde que se conectó. */
  @SubscribeMessage('unirse')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: RoomBody) {

    const id = body?.contratacionId;

    if (!isId(id)) return { ok: false, code: 'BAD_REQUEST' };

    try {
      const user = await this.auth.authenticate(client);
      await this.chat.access(user.userId, BigInt(id));
    } catch (err) {
      return { ok: false, code: err instanceof UnauthorizedException ? 'UNAUTHORIZED' : 'NOT_FOUND' };
    }

    await client.join(roomOf(id));
    return { ok: true };
  }

  @SubscribeMessage('salir')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: RoomBody) {

    if (isId(body?.contratacionId)) await client.leave(roomOf(body.contratacionId));
    return { ok: true };
  }

  /** Lo llama ChatController después de guardar: así nadie ve un mensaje que no quedó en la base. */
  broadcast(message: ChatMessage) {

    this.server.to(roomOf(message.contratacionId)).emit('mensaje', message);
  }
}
