# Reclamos y panel del administrador (E12 y E14: HU-54, HU-57 y HU-59)

Código en `backend/src/modules/claims/`, `backend/src/modules/cancellations/force-majeure.service.ts` y `backend/src/modules/admin/`. La revisión de verificaciones (HU-58) está en `docs/verification.md`.

Las rutas `/api/admin/*` exigen `users.is_admin` (D-11); cualquier otro usuario recibe 403. Un administrador que es parte de la contratación no puede gestionar su reclamo ni evaluar su fuerza mayor (403).

## Cuentas de administrador

El administrador no se registra desde la app ni tiene perfil de cliente o de prestador: se crea con `npm run admin:create` (rama `fix/frontend-qa`, PR #46). `jwt.strategy.ts` lee `is_admin` de la base en cada petición, así que quitar el permiso en la base aplica desde la siguiente petición, sin cerrar sesión.

## Trazabilidad (HU-61)

Cada acción queda en `audit_events` (inmutable), en la misma transacción que el cambio:

| `event_type` | `entity_type` | Actor | Estados |
|---|---|---|---|
| `claim_created` | `claim` | quien reclama | → `abierto` |
| `claim_status_changed` | `claim` | administrador | anterior → nuevo |
| `verification_submitted` | `identity_verification` | prestador | → `pending` |
| `verification_reviewed` | `identity_verification` | administrador | `pending` → `approved` / `rejected` |
| `force_majeure_reviewed` | `cancellation` | administrador | `pending` → `approved` / `rejected` |

## Migración `20261024000003_reclamos_y_fuerza_mayor`

- **Tabla `claim_status_history`:** guarda cada cambio de estado de un reclamo con su nota y su autor (HU-57.4).
  - La primera fila es la apertura: estado `abierto`, sin nota, hecha por quien presenta el reclamo.
  - `claims.resolution` guarda la nota del último cambio.
- **Columna `cancellations.force_majeure_reviewed_at`:** la fecha de la evaluación (HU-59.3). Un `CHECK` exige que el administrador y la fecha estén los dos o ninguno.

## Reclamos de las partes (HU-54)

- `POST /api/contracts/:id/claims` (multipart) recibe:
  - `motivo`: `trabajo_no_realizado`, `calidad_deficiente`, `cobro_indebido`, `comportamiento_inadecuado`, `transferencia_no_confirmada` u `otro`.
  - `descripcion`: de 1 a 1000 caracteres.
  - `fotos`: hasta 5, opcionales.
- Lo presenta una de las partes y siempre va contra la otra: el servidor decide contra quién y la base lo vuelve a revisar.
- Solo en FINALIZADO o COMPLETADO, los mismos estados que muestran la acción `reclamar`. En otro estado, 409 `REQUEST_STATE`. A quien no es parte, 404.
- Queda `abierto` con quién y cuándo (HU-54.3), y se avisa a la otra parte (`claim_updated`).
- Cada persona tiene un solo reclamo activo por contratación (409 `CLAIM_OPEN`). Errores de fotos: `CLAIM_PHOTOS`, `INVALID_IMAGE` e `IMAGE_TOO_LARGE`.
- Las fotos son privadas (`private/claims/`) y se entregan con enlaces firmados (HU-54.4, HU-60).
- `GET /api/claims/mine`: los reclamos presentados y los recibidos, del perfil activo, del más reciente al más antiguo.
- `GET /api/claims/:id`: el detalle; a quien no es parte, 404. Responde `{ id, contratacionId, servicio, motivo, descripcion, estado, creado, mio, contraparte, fotos, historial, resolucion }`.
  - `historial` trae `{ estado, fecha, nota }` de cada cambio.
  - `resolucion` es la nota del último cambio cuando el reclamo está resuelto o cerrado.

## Gestión de reclamos (HU-57)

- `GET /api/admin/claims?estado=&desde=&hasta=`: filtra por estado y por día de creación (`AAAA-MM-DD`, en hora de Colombia, los dos extremos incluidos). Si el rango está al revés, 400 `DATE_RANGE`. Del más reciente al más antiguo, con las partes y su rol.
- `GET /api/admin/claims/:id` (HU-57.2): trae la contratación (estado, fecha, valor, zona), las partes, el motivo, la descripción, las fotos y el historial con el administrador de cada cambio.
- `POST /api/admin/claims/:id/status` con `{ estado, resolucion }`. La resolución es obligatoria (HU-57.4).
  - Cambios permitidos, iguales a los del front:

    | Desde | Puede pasar a |
    |---|---|
    | abierto | en revisión, información solicitada, resuelto, cerrado |
    | en revisión | información solicitada, resuelto, cerrado |
    | información solicitada | en revisión, resuelto, cerrado |
    | resuelto | cerrado |

  - Cualquier otro cambio responde 409 `CLAIM_TRANSITION`.
  - Avisa a las dos partes con el nuevo estado y la resolución (HU-57.5). Dos administradores a la vez se bloquean con `FOR UPDATE`.

## Evaluación de fuerza mayor (HU-59)

- `GET /api/admin/force-majeure`: las pendientes, de la más antigua a la más reciente. Cada una trae las partes, el motivo, la evidencia (`{ nombre, url }` con enlace firmado), la fecha de cancelación, la del servicio y `estadoAlCancelar` (de `audit_events`).
- `POST /api/admin/force-majeure/:id/review` con `{ decision: aprobada | rechazada }`. El `:id` es el de la contratación.
  - Guarda el resultado, el administrador y la fecha, y avisa a quien canceló (`force_majeure_result`).
  - Si ya fue evaluada, 409 `FORCE_MAJEURE_REVIEWED`. Si no hay fuerza mayor, 404.
  - La cancelación no cambia: solo queda constancia de si la causa era válida.
- En el detalle de la contratación, `cierre.fuerzaMayor` trae `{ evaluacion, fecha, evidencia }`. `evidencia` es un enlace firmado y solo lo recibe quien canceló; la otra parte recibe `null` (HU-60).

## Resumen del panel (E14)

`GET /api/admin/summary` responde `{ reclamos, verificaciones, fuerzaMayor }`:

- `reclamos`: los activos (abiertos, en revisión o con información solicitada).
- `verificaciones` y `fuerzaMayor`: las pendientes.

## Prueba en vivo

Hecha el 2026-10-24 en una base y un bucket desechables.

- **HU-54:**
  - Errores: en EN_CURSO, motivo inválido, descripción vacía, foto falsa, tercero (404) y segundo reclamo (`CLAIM_OPEN`).
  - El cliente y el prestador reclaman en FINALIZADO: la foto firmada abre, los dos ven los dos reclamos con `mio` correcto y llega el aviso a la otra parte.
- **HU-57:**
  - 403 al cliente.
  - Filtros por estado y por fecha, y `DATE_RANGE`.
  - Detalle completo.
  - Errores al cambiar: sin resolución, `CLAIM_TRANSITION` y 404.
  - Pasa a en revisión y luego a resuelto, con historial, administrador, resolución visible para la parte y avisos a las dos partes.
- **HU-59:**
  - Fuerza mayor en EN_CURSO con PDF: aparece con `estadoAlCancelar: en_curso`.
  - Aprobación y `FORCE_MAJEURE_REVIEWED`.
  - Evidencia: quien canceló la abre (200 PDF) y la otra parte recibe `null`.
  - Llega el aviso.
- **Resumen:** los números cambian con cada acción, y responde 403 al prestador.
