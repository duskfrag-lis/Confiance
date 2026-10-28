import type { RequestState } from '../contracting/contracting.constants';

/** D-53: en estos estados el chat queda de solo lectura (lo mismo revisa fn_check_chat_message en la base). */
export const READ_ONLY_STATES: RequestState[] = ['rechazado', 'cancelado', 'completado'];

/** Largo máximo de un mensaje: el de la columna chat_messages.message_text. */
export const MESSAGE_MAX_LENGTH = 2000;

/** Mensajes por página del historial y el máximo que se puede pedir. */
export const PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 50;

/** Límite de envío: 10 mensajes cada 10 segundos. */
export const SEND_THROTTLE = { default: { limit: 10, ttl: 10_000 } };

/** Sala de socket.io de una contratación. */
export const roomOf = (requestId: bigint | string) => `contratacion:${requestId}`;
