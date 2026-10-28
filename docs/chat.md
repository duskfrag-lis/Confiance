# Chat (E7, HU-42)

Código en `backend/src/modules/chat/`. Chat por contratación entre sus dos partes: se envía por HTTP y se recibe en
tiempo real por socket.io. La base revisa lo mismo al guardar (`fn_check_chat_message`, D-53).

## Reglas

- **Quién:** solo el cliente y el prestador de la contratación, sin importar el perfil activo. A los demás se les
  responde 404, sin revelar que la contratación existe (como HU-38.7).
- **Desde cuándo:** desde SOLICITADO. FINALIZADO sigue abierto.
- **Solo lectura (D-53):** RECHAZADO, CANCELADO y COMPLETADO. Se puede leer el historial, pero enviar da 409
  `CHAT_READ_ONLY`, también si el estado cambia justo antes de guardar (la base frena el INSERT y se traduce).
- **Mensajes:** texto de 1 a 2000 caracteres, sin espacios a los lados. Sin adjuntos.
- **Límite:** 10 mensajes cada 10 s por usuario (429 al pasarse).
- **Avisos (HU-62):** un `new_chat_message` por conversación sin leer. Si la otra parte ya tiene uno sin leer de esa
  contratación, no se crea otro.
- **Leídos:** fuera de alcance; la tabla no guarda qué se leyó (B-06).

## HTTP

Mensaje en la API (igual para las dos partes):

```
{ id: '51', contratacionId: '30', autor: 'cliente' | 'prestador', texto, enviadoEn: '2026-10-22T15:00:00.000Z' }
```

### `GET /api/contracts/:id/messages?antesDe=&limite=`

Historial, del mensaje más antiguo al más reciente, por páginas hacia atrás.

- `limite`: 1 a 50 (por defecto 30).
- `antesDe`: id del mensaje más antiguo que ya se tiene (el `siguienteCursor` de la página anterior).

```
{ estado: 'aceptado', soloLectura: false, mensajes: [ ... ], siguienteCursor: '52' | null }
```

`soloLectura: true` sirve para esconder la caja de texto. `siguienteCursor: null`: no hay mensajes más antiguos.

Errores: 400 (`limite` o `antesDe` no válidos), 401 sin sesión, 404 si no existe o no se es parte.

### `POST /api/contracts/:id/messages`

Cuerpo `{ texto }`. Responde el mensaje guardado y lo emite a la sala de la contratación.

Errores: 400 "Escribe un mensaje." o largo, 404, 409 `CHAT_READ_ONLY`, 429 por límite.

## Socket

- URL: `<origen del backend>/chat`, opción `path: '/api/socket.io'` (nginx solo reenvía `/api/`).
- Autenticación: la cookie `access_token` (en el navegador, `withCredentials: true`). Se revisa al conectar y en cada
  `unirse`. Si no es válida, el servidor emite `no_autorizado` y desconecta.

| Evento | Dirección | Datos | Respuesta (ack) |
| --- | --- | --- | --- |
| `unirse` | cliente → servidor | `{ contratacionId: '30' }` | `{ success: true, data: { ok: true } }` o `data: { ok: false, code: 'BAD_REQUEST' \| 'UNAUTHORIZED' \| 'NOT_FOUND' }` |
| `salir` | cliente → servidor | `{ contratacionId: '30' }` | `{ success: true, data: { ok: true } }` |
| `mensaje` | servidor → sala | el mensaje de la API | — |
| `no_autorizado` | servidor → cliente | — | — |

El mensaje se emite solo después de guardarse. Quien envía lo recibe dos veces (respuesta del POST y evento del
socket): usar `id` para no pintarlo dos veces.

Prueba manual: `node backend/scripts/chat-probe.mjs <access_token> <contratacionId>` (ver
`docs/guias/chat-paso-a-paso.md`, paso 9).
