# Contratación (E5, HU-34 a HU-37)

Código en `backend/src/modules/contracting/`. Todas las rutas exigen sesión. Las del cliente piden el perfil activo de cliente y las del prestador, el de prestador (`RolesGuard`, 403 si no). Una contratación de la que el usuario no es parte responde 404, igual que una que no existe (HU-38.7).

La base ya tenía las reglas del ciclo (`fn_service_request_before_write`, `fn_service_request_dates`, `fn_check_provider_slot_free`). El backend las revisa antes para devolver un error legible. Si dos operaciones se cruzan después de esa revisión, la base frena la segunda y el backend traduce su excepción al mismo código (`DB_RULES` en `contracts.service.ts`).

Las respuestas de crear, aceptar, rechazar y confirmar son un resumen:

```
{ id, estado: 'solicitado' | 'aceptado' | 'rechazado' | 'confirmado', fechaHora, valor }
```

La consulta de la contratación (HU-38) y el historial del cliente (HU-12) van en la PR B de la E5.

## HU-34 · Iniciar una solicitud (perfil activo cliente)

| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| GET | `/api/contracts/new/:listingId` | --- | Lo que necesita el formulario (ver abajo) |
| POST | `/api/contracts` | `publicacionId`, `fechaHora`, `barrioId`, `direccion`, `valor` | 201. Queda en SOLICITADO y se avisa al prestador (`request_received`) |

`GET /new/:listingId` responde:

```
{ publicacion: { id, titulo, precioMin, precioMax, precioFijo },
  prestador: { id, nombre },
  zona: { barrioId, barrio, comunaId, comuna } | null,   // zona de referencia del cliente (HU-11), para rellenar
  direccion: string | null,
  horarios: [{ fecha: 'AAAA-MM-DD', bloque: 'manana' | 'tarde' | 'noche', inicio: 'HH:MM', fin: 'HH:MM' }] }
```

- `horarios` son los bloques **libres** del prestador desde hoy y durante 14 días (HU-34.4, HU-39.2). Son los días y bloques de su disponibilidad (HU-17), quitando los ocupados por una contratación en ACEPTADO, CONFIRMADO o EN_CURSO (`fn_provider_slot_taken`, el mismo criterio de la búsqueda). Un bloque de hoy que ya terminó no sale.
- El rango de precio es solo una referencia (HU-34.5): el cliente propone cualquier valor mayor que cero.
- Desde un perfil (HU-34.2), el cliente elige una de las publicaciones activas que muestra `GET /api/providers/:id` y sigue con esta ruta.

Validaciones al crear:

| Caso | Respuesta |
|---|---|
| Publicación que no existe, pausada, retirada o de una cuenta deshabilitada (HU-34.1) | 404 |
| Publicación propia (HU-34.7) | 409 `SELF_HIRE` |
| Barrio que no existe o está inactivo | 400 `INVALID_ZONE` |
| `fechaHora` sin hora o sin zona horaria (`2026-10-27T09:00:00-05:00`) | 400 |
| Fecha pasada | 400 `PAST_DATE` |
| Fuera de los bloques (por ejemplo a las 23:00) o en un día o bloque que el prestador no atiende (HU-34.4) | 400 `OUTSIDE_AVAILABILITY` |
| Bloque ya ocupado | 409 `SLOT_TAKEN` |
| `valor` de 0 o con decimales | 400 (de 1 a 30 000 000) |

En SOLICITADO el bloque no se reserva (HU-39.3): dos clientes pueden pedir el mismo bloque y el prestador acepta uno. Aun así, no se deja solicitar en un bloque que ya está ocupado, porque esa solicitud no se podría aceptar.

La solicitud que nace al seleccionar a un interesado (HU-34.3) la sigue creando `POST /api/needs/mine/:id/interests/:interestId/select` (HU-30, `docs/publications.md`).

## HU-35 · Trazabilidad

La garantiza la base: exactamente un origen (publicación o necesidad), cliente, prestador y origen fijos después de creada, y la fecha solo cambia con un reagendamiento desde ACEPTADO. Cada operación fija `app.user_id` en su transacción, y el trigger `fn_service_request_after_write` registra en `audit_events` el estado anterior, el nuevo, el actor y la hora. Los cambios automáticos quedan con actor `NULL`.

## HU-36 · Aceptar o rechazar (perfil activo prestador)

| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| POST | `/api/contracts/:id/accept` | --- | SOLICITADO → ACEPTADO. Ocupa el bloque. Avisa al cliente (`request_accepted`) |
| POST | `/api/contracts/:id/reject` | `motivo` opcional (máximo 300) | SOLICITADO → RECHAZADO. Guarda el motivo y se lo cuenta al cliente (`request_rejected`) |

- Fuera de SOLICITADO: 409 `REQUEST_STATE` (también si se repite la operación).
- Aceptar con la fecha pasada: 409 `PAST_DATE`. Con el bloque ocupado: 409 `SLOT_TAKEN` (HU-36.2).
- Dos aceptaciones simultáneas del mismo prestador: la base las serializa bloqueando su perfil (`fn_check_provider_slot_free`) y la segunda sale con `SLOT_TAKEN`.
- Cada respuesta bloquea la fila de la contratación (`SELECT … FOR UPDATE`), así aceptar y rechazar a la vez no se cruzan.

## HU-37 · Confirmar (perfil activo cliente)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/contracts/:id/confirm` | ACEPTADO → CONFIRMADO. La base crea la cita (HU-40). Avisa a las dos partes (`request_confirmed`) |

- Fuera de ACEPTADO: 409 `REQUEST_STATE`. Con la fecha pasada: 409 `PAST_DATE`.
- No depende del pago (HU-37.4).
- Qué parte aceptó y cuándo (HU-37.3) sale de `audit_events`: el cambio a ACEPTADO lo hizo el prestador y el cambio a CONFIRMADO, el cliente. No se cambió el esquema.
- Cancelar desde ACEPTADO (HU-37.1, HU-50) llega con la épica de cancelaciones.

## HU-52 · Cancelación automática por plazo (HU-36.5, HU-37.5)

`ContractsScheduler` corre cada 15 minutos y llama a `fn_auto_cancel_stale_requests()`. Esa función cancela las solicitudes sin respuesta del prestador en 48 horas y las aceptadas que el cliente no confirmó en 24. El backend avisa a las dos partes (`request_auto_cancelled`) en la misma transacción. Si falla, lo registra en el log y lo reintenta en la siguiente vuelta.

## La necesidad vuelve a abrirse

Decidido el 2026-10-19 y aplicado el 2026-10-20 (migración `20261020000001_necesidad_reabre`). Si la solicitud que nació de una necesidad (HU-30) se **rechaza o se cancela**, también la cancelación automática, la base devuelve la necesidad a ABIERTA:

- El prestador de esa solicitud queda "no seleccionado" y no se le puede volver a elegir. `select` responde 409 `INTEREST_STATE`, porque ahora solo se elige un interés pendiente.
- Los demás interesados, que pasaron a "no seleccionado" al elegir, vuelven a "pendiente".
- Una necesidad cerrada no se reabre.

El aviso al cliente lo menciona ("Tu necesidad volvió a quedar abierta…"). A los interesados que vuelven a pendiente todavía no se les avisa, porque no hay un tipo de notificación para eso.
