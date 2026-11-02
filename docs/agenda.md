# Agenda (E6, HU-39 a HU-41)

Código en `backend/src/modules/agenda/`. La HU-39 y la HU-40 viven en la base; el backend solo agrega la consulta (HU-41).

## HU-39 · Programación dentro de la disponibilidad

Ya estaba en la base. La E5 la usa al solicitar:

- **Día y bloque configurados (HU-39.1):** `fn_check_provider_availability` al crear una solicitud desde una publicación y al reagendar. Los bloques son mañana (06:00 a 12:00), tarde (12:00 a 18:00) y noche (18:00 a 22:00), en hora de Colombia.
- **La interfaz no ofrece bloques ocupados (HU-39.2):** `GET /api/contracts/new/:listingId` devuelve solo los bloques libres de los próximos 14 días (ver `docs/contracting.md`).
- **Ocupado (HU-39.3, HU-39.4):** un bloque está ocupado si hay una contratación en ACEPTADO, CONFIRMADO o EN_CURSO ese día (`fn_provider_slot_taken`). En SOLICITADO no se reserva. Al aceptar, `fn_check_provider_slot_free` bloquea el perfil del prestador, así dos aceptaciones simultáneas no toman el mismo bloque.

## HU-40 · Generación automática de cita

La hace el trigger `fn_service_request_after_write`:

| Contratación | Cita |
|---|---|
| CONFIRMADO | se crea `upcoming` con la fecha de la contratación |
| EN_CURSO | `in_progress` |
| FINALIZADO | `completed` (y sigue así en COMPLETADO) |
| CANCELADO | `cancelled` |

La fecha de la cita (y la de la contratación desde ACEPTADO) solo cambia con un reagendamiento aceptado (HU-40.3): `fn_apply_reschedule_response`. Un cambio directo lo rechazan `fn_service_request_dates` y `fn_appointment_dates`. Probado el 2026-10-20 en una base desechable.

## HU-41 · Mis citas

`GET /api/appointments/mine?estado=` (con sesión, cualquier perfil): las citas del **perfil activo**, como cliente o como prestador, ordenadas por fecha de la más próxima a la más lejana (HU-41.1). `estado` es opcional: `proxima`, `en_curso`, `completada` o `cancelada` (HU-41.2).

```
[{ id, contratacionId, servicio, fechaHora, bloque: 'manana' | 'tarde' | 'noche', estado, estadoContratacion,
   zona: { barrio, comuna },
   prestador: { id, nombre, fotoUrl } }]   // como cliente; como prestador trae `cliente: { nombre, fotoUrl }`
```

- `contratacionId` lleva a la contratación (HU-41.3, `GET /api/contracts/:id`).
- No incluye la dirección exacta. Está en el detalle de la contratación, con sus reglas de visibilidad.
- Una contratación tiene cita solo desde CONFIRMADO. Las solicitudes y las aceptadas sin confirmar no aparecen aquí: están en `GET /api/contracts/mine`.
