# Cancelaciones y reagendamiento (E11, HU-50, HU-51 y HU-53)

Código en `backend/src/modules/cancellations/`. La cancelación automática por plazo (HU-52) está en la E5 (`ContractsScheduler`, ver `docs/contracting.md`). La base aplica cada cancelación (`fn_apply_cancellation`: pasa a CANCELADO, libera el horario, reabre la necesidad) y cada reagendamiento aceptado (`fn_apply_reschedule_response`: mueve la cita); el backend revisa quién, cuándo y avisa.

Las tres rutas las usa cualquiera de las dos partes, sin importar el perfil activo. Responden `{ id, estado, fechaHora, valor }`. A quien no es parte, 404; en un estado que no corresponde, 409 `REQUEST_STATE`.

## HU-50 y HU-51 · Cancelar

`POST /api/contracts/:id/cancel` (multipart): `motivo` (1 a 500), `fuerzaMayor` (`true`/`false`, por defecto `false`) y `evidencia` (opcional, solo con fuerza mayor).

| | Ordinaria (HU-50) | Fuerza mayor (HU-51) |
|---|---|---|
| Estados | SOLICITADO, ACEPTADO, CONFIRMADO | también EN_CURSO |
| Plazo | más de 24 h antes de la cita (o de la fecha propuesta si aún no hay cita) → si no, 409 `CANCEL_NOTICE` | sin plazo |
| Desde FINALIZADO | no | no (HU-51.2: va por reclamo). La base lo admitía; el backend lo bloquea |
| Evaluación | — | `pendiente` hasta que el administrador la resuelva (HU-59) |

- Queda el actor, el motivo y la fecha (HU-50.5). El detalle lo muestra en `cierre` (`por`, `motivo`, `fuerzaMayor.evaluacion`, `fecha`).
- Se avisa a la otra parte (`request_cancelled`). Si el prestador cancela una contratación que venía de una necesidad, el aviso le dice al cliente que la necesidad volvió a quedar abierta.
- **Evidencia (HU-51, HU-60):** JPG, PNG o PDF de máximo 5 MB, validada por su contenido (`INVALID_EVIDENCE`, `EVIDENCE_TOO_LARGE`). Se guarda en `private/force-majeure/` del bucket: `/media` no la sirve (404). Las fotos se reencodan (sin metadatos, GPS incluido). La entregará el panel del administrador con un enlace firmado (HU-59). Con una cancelación ordinaria responde 400 `EVIDENCE_NOT_ALLOWED`. Si la cancelación falla, la evidencia subida se borra.

## HU-53 · Reagendar

- `POST /api/contracts/:id/reschedule` con `{ fechaHora }` (ISO 8601 con zona): en ACEPTADO o CONFIRMADO, también dentro de las últimas 24 h (HU-53.1).
  - Futura (`PAST_DATE`), distinta de la actual (`SAME_DATE`), dentro de la disponibilidad del prestador (`OUTSIDE_AVAILABILITY`) y sin chocar con otra contratación (`SLOT_TAKEN`) (HU-53.2).
  - Una pendiente a la vez (`RESCHEDULE_PENDING`) y máximo 2 solicitudes por contratación (`RESCHEDULE_LIMIT`) (HU-53.4).
  - Se avisa a la otra parte (`reschedule_requested`).
- `POST /api/contracts/:id/reschedule/respond` con `{ aceptar }`: responde **la otra parte**, no quien la pidió (`RESCHEDULE_OWN`). Sin propuesta pendiente, `RESCHEDULE_NONE`. Si acepta, cambia la cita (o la fecha propuesta, si aún está en ACEPTADO) y la base revisa otra vez que el bloque siga libre; si rechaza, se mantiene la anterior (HU-53.3). Se avisa a quien la pidió (`reschedule_answered`).
- El historial (fecha anterior, nueva, quién, cuándo y resultado) sale en `reagendamientos` del detalle (HU-53.5).

Probado el 2026-10-24 en una base desechable: cancelación ordinaria y el bloque liberado para otra solicitud; `CANCEL_NOTICE` con menos de 24 h; fuerza mayor en EN_CURSO con PDF (evidencia privada, `/media` → 404) y bloqueada en FINALIZADO; reagendar con cada error, aceptar (la agenda cambia), rechazar, límite de 2, y reagendar en ACEPTADO.
