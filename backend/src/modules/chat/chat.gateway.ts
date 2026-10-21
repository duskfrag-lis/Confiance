import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../../common/types/auth-user';
import { ACCESS_COOKIE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/session/jwt.strategy';
import type { AccessTokenPayload } from '../auth/session/session.service';
import { ChatService, type ChatMessage } from './chat.service';

/** Anti-abuso: mensajes por socket en la ventana. Escribir rápido entre dos personas no llega a esto. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10_000;

type Ack = { ok: true; [key: string]: unknown } | { ok: false; code: string; message: string };

const room = (requestId: bigint | string) => `contratacion:${requestId}`;

const readCookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];

const failure = (err: unknown): Ack => {

  if (err instanceof HttpException) {

    const body = err.getResponse() as { code?: string; message?: string };
    return { ok: false, code: body.code ?? String(err.getStatus()), message: body.message ?? err.message };
  }

  throw err;
};

/**
 * HU-42 · Tiempo real del chat (socket.io, namespace /chat, ruta /api/socket.io). Se autentica con la misma
 * cookie de sesión que la API y la vuelve a validar en cada evento: una sesión cerrada, una cuenta deshabilitada
 * o un token vencido dejan de servir al instante (el cliente recibe `sesion_expirada`, renueva y se reconecta).
 *
 * Eventos del cliente (con respuesta `{ ok, ... }`):
 * - `unirse` { contratacionId } → entra a la sala si es parte; responde `soloLectura`.
 * - `enviar` { contratacionId, texto } → guarda, avisa a la otra parte y emite `mensaje` a la sala.
 * Eventos del servidor: `mensaje` (ChatMessage) y `sesion_expirada`.
 */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection {

  @WebSocketServer() private server!: Namespace;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly sent = new WeakMap<Socket, number[]>();

  constructor(
    private chat: ChatService,
    private jwt: JwtService,
    private config: ConfigService,
    private strategy: JwtStrategy,
  ) {}

  async handleConnection(socket: Socket) {

    if (!(await this.user(socket))) this.expire(socket);
  }

  @SubscribeMessage('unirse')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { contratacionId?: unknown }): Promise<Ack> {

    const user = await this.user(socket);
    if (!user) return this.expire(socket);

    const requestId = this.requestId(body?.contratacionId);
    if (requestId === null) return { ok: false, code: 'BAD_REQUEST', message: 'Contratación inválida.' };

    try {

      const party = await this.chat.partyOf(user.userId, requestId);
      await socket.join(room(requestId));
      return { ok: true, soloLectura: party.readOnly };
    } catch (err) {

      return failure(err);
    }
  }

  @SubscribeMessage('enviar')
  async send(@ConnectedSocket() socket: Socket, @MessageBody() body: { contratacionId?: unknown; texto?: unknown }): Promise<Ack> {

    const user = await this.user(socket);
    if (!user) return this.expire(socket);

    const requestId = this.requestId(body?.contratacionId);
    const text = typeof body?.texto === 'string' ? body.texto.trim() : '';

    if (requestId === null) return { ok: false, code: 'BAD_REQUEST', message: 'Contratación inválida.' };
    if (!text) return { ok: false, code: 'BAD_REQUEST', message: 'Escribe un mensaje.' };
    if (text.length > 2000) return { ok: false, code: 'BAD_REQUEST', message: 'El mensaje puede tener máximo 2000 caracteres.' };
    if (this.limited(socket)) return { ok: false, code: 'RATE_LIMITED', message: 'Vas muy rápido. Espera unos segundos.' };

    try {

      const message = await this.chat.send(user.userId, requestId, text);
      this.broadcast(message);
      return { ok: true, mensaje: message };
    } catch (err) {

      return failure(err);
    }
  }

  /** Lo usa también el envío por HTTP, para que la otra parte lo reciba en tiempo real. */
  broadcast(message: ChatMessage) {

    this.server.to(room(message.contratacionId)).emit('mensaje', message);
  }

  /** Valida la cookie del handshake con las mismas reglas que JwtAuthGuard (sesión viva, cuenta activa). */
  private async user(socket: Socket): Promise<AuthUser | null> {

    const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
    if (!token) return null;

    try {

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(decodeURIComponent(token), {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      return await this.strategy.validate(payload);
    } catch {

      return null;
    }
  }

  private expire(socket: Socket): Ack {

    socket.emit('sesion_expirada');
    socket.disconnect(true);
    return { ok: false, code: 'SESSION_EXPIRED', message: 'Tu sesión venció. Vuelve a cargar la página.' };
  }

  private requestId(value: unknown) {

    const raw = typeof value === 'number' ? String(value) : value;
    return typeof raw === 'string' && /^\d{1,18}$/.test(raw) ? BigInt(raw) : null;
  }

  private limited(socket: Socket) {

    const now = Date.now();
    const recent = (this.sent.get(socket) ?? []).filter((t) => now - t < RATE_WINDOW_MS);

    if (recent.length >= RATE_LIMIT) {

      this.logger.warn(`Chat: socket ${socket.id} superó ${RATE_LIMIT} mensajes en ${RATE_WINDOW_MS / 1000} s`);
      return true;
    }

    this.sent.set(socket, [...recent, now]);
    return false;
  }
}
