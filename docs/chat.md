# Chat por contratación (E7 · HU-42, HU-62)

Cada contratación tiene una conversación entre sus dos partes. Se envía por HTTP y la interfaz consulta la
conversación cada 2,5 s (y la lista de chats cada 15 s); no hay socket.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/chats/mine` | Una conversación por contratación del **perfil activo**: contraparte, último mensaje, `sinLeer`, `soloLectura`. Primero las que tienen mensajes, de la más reciente a la más antigua. |
| GET | `/api/contracts/:id/messages` | `{ soloLectura, mensajes: [{ id, texto, fecha, mio }], leidoPorContraparte }`, del más antiguo al más reciente (los últimos 500). |
| POST | `/api/contracts/:id/messages` | `{ texto }` (1 a 2000 caracteres, sin espacios a los lados). Devuelve el mensaje guardado. 10 envíos cada 10 s. |
| POST | `/api/contracts/:id/messages/read` | Marca la conversación como leída hasta ahora y deja leído su aviso `new_chat_message`. 204. |

## Reglas

- Solo las dos partes, sin importar el perfil activo. A los demás, 404 (no se revela que la contratación existe).
- Se escribe de SOLICITADO a FINALIZADO. En RECHAZADO, CANCELADO y COMPLETADO es de solo lectura: 409
  `CHAT_READ_ONLY` (D-53). Si el estado cambia justo antes de guardar, el trigger `fn_check_chat_message` lo frena y
  sale el mismo código.
- HU-62: un aviso `new_chat_message` por conversación sin leer, no uno por mensaje.
- Quien escribe ya leyó lo anterior: enviar también avanza su marca de leído.

## Leídos

La tabla `chat_reads` (migración `20261103000001_chat_leidos`) guarda, por parte y contratación, hasta cuándo leyó.
La marca solo avanza (`GREATEST`) y usa el reloj de la base, igual que `chat_messages.sent_at`. De ahí salen
`sinLeer` (mensajes de la otra parte posteriores a mi marca) y `leidoPorContraparte` (la marca de la otra parte, que la
interfaz muestra como "Visto").

## Frontend

Se quitó `core/mock/chat-mock.interceptor.ts`: el chat usa el backend real también con `mockApi: true`.
