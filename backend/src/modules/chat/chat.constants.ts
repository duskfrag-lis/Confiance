import type { RequestState } from '../contracting/contracting.constants';

/** D-53: en estos estados el chat se puede leer pero no escribir (la base lo repite en fn_check_chat_message). */
export const READ_ONLY_STATES: RequestState[] = ['rechazado', 'cancelado', 'completado'];

/** HU-42: largo máximo de un mensaje (chat_messages.message_text es VARCHAR(2000)). */
export const MESSAGE_MAX_LENGTH = 2000;

/** Mensajes que trae la conversación: los más recientes. Una contratación no llega a tantos. */
export const THREAD_LIMIT = 500;

/** Envío: 10 mensajes cada 10 s por persona; el sondeo de la conversación no cuenta aquí. */
export const SEND_THROTTLE = { default: { limit: 10, ttl: 10_000 } };
