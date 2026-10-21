# Chat (E7, HU-42)

Código en `backend/src/modules/chat/`. El chat siempre pertenece a una contratación y solo lo leen y escriben sus dos partes (HU-42.1). La base también lo exige (`fn_check_chat_message`, D-53). Cualquier perfil activo sirve: lo que cuenta es ser el cliente o el prestador de esa contratación. A cualquier otro se le responde como si la contratación no existiera (404).

## Reglas

- **Desde cuándo y hasta cuándo (HU-42.2):** se puede escribir desde SOLICITADO. En RECHAZADO, CANCELADO y COMPLETADO el chat queda de **solo lectura** y enviar responde 409 `CHAT_READ_ONLY`. Si el estado cambia justo antes de guardar, la base lo frena y sale el mismo error.
- **Mensajes (HU-42.3):** texto de 1 a 2000 caracteres, sin espacios al inicio ni al final, con la fecha y hora en que se guardó.
- **Historial (HU-42.4):** se conserva completo.
- **Aviso (HU-42.5):** cada mensaje genera una notificación `new_chat_message` a la otra parte, con los primeros 80 caracteres. Se guarda en la misma transacción que el mensaje.

Un mensaje:

```
{ id, contratacionId, autor: 'cliente' | 'prestador', autorId, texto, fecha }
```

## HTTP

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/contracts/:id/messages?antes=` | `{ soloLectura, hayMas, mensajes }`. Páginas de 50 mensajes, cada una del más antiguo al más reciente. Para cargar los anteriores, `antes` = id del mensaje más antiguo que ya se tiene |
| POST | `/api/contracts/:id/messages` | `{ texto }`. Devuelve el mensaje y también lo emite por WebSocket a la sala. Sirve de respaldo si el WebSocket no está conectado |

## Tiempo real (WebSocket)

socket.io, namespace `/chat`, ruta **`/api/socket.io`** (la misma que la API, para usar un solo proxy y las mismas cookies). En Docker, nginx hace el cambio a WebSocket en `location /api/socket.io/`.

```ts
const socket = io(`${origen}/chat`, { path: '/api/socket.io', withCredentials: true });
socket.emitWithAck('unirse', { contratacionId: '12' });       // { ok: true, soloLectura } | { ok: false, code, message }
socket.emitWithAck('enviar', { contratacionId: '12', texto }); // { ok: true, mensaje } | { ok: false, code, message }
socket.on('mensaje', (m) => ...);                             // mensajes nuevos de la sala, también los propios
socket.on('sesion_expirada', () => ...);                      // renovar la sesión (/auth/refresh) y reconectar
```

- **Sesión:** se autentica con la cookie `access_token`, con las mismas reglas que `JwtAuthGuard` (sesión vigente y cuenta no deshabilitada), y **se vuelve a validar en cada evento**. Una sesión cerrada, una cuenta deshabilitada o un token vencido reciben `sesion_expirada` y se desconectan. El token de acceso dura poco, así que el front debe renovar y reconectar.
- **Salas:** `unirse` solo entra a la sala de una contratación propia. `mensaje` se emite a toda la sala, incluido quien lo envió (sirve como confirmación en otras pestañas).
- **Errores en la respuesta:** `404` (no es parte), `CHAT_READ_ONLY`, `BAD_REQUEST` (contratación o texto inválidos), `RATE_LIMITED` (más de 10 mensajes en 10 segundos por conexión) y `SESSION_EXPIRED`.
- Las respuestas del WebSocket no llevan el envoltorio `{ success, data }` de HTTP (`TransformInterceptor` solo aplica a HTTP).

## Fuera de alcance

- Marcar mensajes como leídos y el contador de "sin leer": la tabla no tiene esa columna y la HU no lo pide. El aviso nuevo llega por las notificaciones (HU-62).
- El diseño del chat sigue pendiente de revisión (B-06).
