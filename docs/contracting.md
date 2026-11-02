# Contratación (E5, HU-34 a HU-38 y HU-12)

Código en `backend/src/modules/contracting/`. Todas las rutas exigen sesión. Las del cliente piden el perfil activo de cliente y las del prestador, el de prestador (`RolesGuard`, 403 si no). Una contratación de la que el usuario no es parte responde 404, igual que una que no existe (HU-38.7).

La base ya tenía las reglas del ciclo (`fn_service_request_before_write`, `fn_service_request_dates`, `fn_check_provider_slot_free`). El backend las revisa antes para devolver un error legible. Si dos operaciones se cruzan después de esa revisión, la base frena la segunda y el backend traduce su excepción al mismo código (`DB_RULES` en `contracts.service.ts`).

Las respuestas de crear, aceptar, rechazar y confirmar son un resumen:

```
{ id, estado: 'solicitado' | 'aceptado' | 'rechazado' | 'confirmado', fechaHora, valor }
```

La consulta completa está en `GET /api/contracts/:id` (HU-38, abajo).

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

## HU-12 · Mis contrataciones (cliente o prestador)

`GET /api/contracts/mine?estado=` devuelve las contrataciones del **perfil activo** (como cliente o como prestador), de la más reciente a la más antigua. `estado` es opcional y debe ser uno de `solicitado`, `aceptado`, `confirmado`, `en_curso`, `finalizado`, `completado`, `cancelado` o `rechazado` (HU-12.2).

```
[{ id, servicio, estado, fechaHora, valor, prestador: { id, nombre, fotoUrl } }]   // como cliente
[{ id, servicio, estado, fechaHora, valor, cliente: { nombre, fotoUrl } }]         // como prestador
```

`fechaHora` es la de la cita cuando existe, porque solo cambia con un reagendamiento aceptado (HU-40.3). Si no hay cita, es la propuesta.

## HU-38 · Detalle de una contratación

`GET /api/contracts/:id` lo pueden pedir solo las dos partes; a cualquier otro se le responde 404 (HU-38.7). La vista depende de **qué parte es el usuario en esa contratación**, no del perfil activo: una prestadora con el perfil de cliente activo igual ve como prestadora las contrataciones donde atiende.

```
{ id, servicio, estado, fechaHora, valor,
  rol: 'cliente' | 'prestador',
  origen: { tipo: 'publicacion' | 'necesidad', id },
  cliente: { nombre, fotoUrl }, prestador: { id, nombre, fotoUrl },
  bloque: 'manana' | 'tarde' | 'noche',
  zona: { barrioId, barrio, comunaId, comuna },
  direccion,                       // HU-38.2: null para el prestador antes de ACEPTADO
  creada,
  plazo: { tipo, hasta } | null,   // el plazo que corre ahora (ver abajo)
  etapas: [{ estadoAnterior, estado, fecha, actor: 'cliente' | 'prestador' | 'sistema' | 'administrador' }],
  reagendamientos: [{ fechaAnterior, fechaNueva, pedidoPor, estado: 'pendiente' | 'aceptado' | 'rechazado', creado }],
  finalizacion: { solicitada, confirmacion: { fecha, automatica } | null } | null,
  pago: { estado, metodo, monto, fecha, intentos: [...] } | null,   // desde FINALIZADO
  datosBancarios: { banco, tipoCuenta, numero } | null,            // solo en la vista del cliente
  cierre: { ... } | null,
  acciones: [...] }
```

- **Etapas (HU-12.4, HU-38.3):** salen de `audit_events`, con el actor por su rol. Las automáticas aparecen como `sistema`.
- **Dirección (HU-38.2):** el prestador la ve en ACEPTADO, CONFIRMADO, EN_CURSO, FINALIZADO y COMPLETADO. Si la contratación se canceló o se rechazó, no la ve. El cliente siempre la ve.
- **Datos bancarios (HU-38.5):** igual que `GET /api/profiles/providers/:id/bank-account` (HU-18.2): el cliente los ve de ACEPTADO a FINALIZADO, con el número completo para transferir. Si el prestador no registró cuenta, es `null`. En la vista del prestador el campo no existe.
- **Pago (HU-38.4, HU-45):** desde FINALIZADO.
  - `estado` puede ser `pendiente`, `en_proceso` (hay un PSE abierto, así no se ofrece pagar dos veces), `pendiente_confirmacion` (transferencia marcada) o `pagado`.
  - `metodo` es `pse` o `transferencia`.
  - `intentos` lista todos los intentos, también los PSE rechazados (HU-45.3).
- **Plazo:** evita que la interfaz lo calcule con el reloj del navegador.
  - `respuesta_prestador`: 48 h desde la creación, en SOLICITADO.
  - `confirmacion_cliente`: 24 h desde la aceptación, en ACEPTADO.
  - `confirmacion_finalizacion`: 24 h desde FINALIZADO, mientras el cliente no confirme.
  - Al vencer, la cancelación o la confirmación automática corren en la siguiente vuelta del proceso (cada 15 min).
- **Cierre (HU-12.3):**
  - `{ tipo: 'completado' }`;
  - `{ tipo: 'rechazado', motivo }`;
  - `{ tipo: 'cancelado', por, motivo, automatica, fuerzaMayor: { evaluacion } | null, fecha }`.

### Acciones (HU-38.6)

`acciones` dice qué botones mostrar (regla 8 de la V7). Cada acción la hace su propia HU; esta lista solo dice si aplica en este momento (`contractActions`):

| Estado | Cliente | Prestador |
|---|---|---|
| SOLICITADO | `cancelar`* · `cancelar_fuerza_mayor` | `aceptar` · `rechazar` · `cancelar`* · `cancelar_fuerza_mayor` |
| ACEPTADO | `confirmar` · `cancelar`* · `cancelar_fuerza_mayor` · `reagendar`** | `cancelar`* · `cancelar_fuerza_mayor` · `reagendar`** |
| CONFIRMADO | `cancelar`* · `cancelar_fuerza_mayor` · `reagendar`** | `iniciar` · `cancelar`* · `cancelar_fuerza_mayor` · `reagendar`** |
| EN_CURSO | `cancelar_fuerza_mayor` | `finalizar` · `cancelar_fuerza_mayor` |
| FINALIZADO | `confirmar_finalizacion` (si no confirmó) · `pagar` (pago `pendiente`) · `reportar` · `reclamar` | `confirmar_transferencia` (pago `pendiente_confirmacion`) · `reportar` · `reclamar` |
| COMPLETADO | `calificar` (si no calificó) · `reportar` · `reclamar` | igual |
| CANCELADO, RECHAZADO | --- | --- |

\* Solo si faltan más de 24 h para la cita, o para la fecha propuesta si aún no hay cita (HU-50). Con menos tiempo se ofrece reagendar.
\** Solo si no hay un reagendamiento pendiente y van menos de 2 (HU-53.4). Si la otra parte pidió uno, sale `responder_reagendamiento`.

## La necesidad vuelve a abrirse

Decidido el 2026-10-19 y aplicado el 2026-10-20 (migración `20261020000001_necesidad_reabre`). Si la solicitud que nació de una necesidad (HU-30) se **rechaza o se cancela**, también la cancelación automática, la base devuelve la necesidad a ABIERTA:

- El prestador de esa solicitud queda "no seleccionado" y no se le puede volver a elegir. `select` responde 409 `INTEREST_STATE`, porque ahora solo se elige un interés pendiente.
- Los demás interesados, que pasaron a "no seleccionado" al elegir, vuelven a "pendiente".
- Una necesidad cerrada no se reabre.

`GET /api/needs/mine/:id` trae `solicitudId` (la solicitud vigente) cuando la necesidad está en "prestador seleccionado". Abierta o reabierta, es `null`.

El aviso al cliente lo menciona ("Tu necesidad volvió a quedar abierta…"). A los interesados que vuelven a pendiente todavía no se les avisa, porque no hay un tipo de notificación para eso.
