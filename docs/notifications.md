# Notificaciones (E15, HU-62)

Código en `backend/src/modules/notifications/`. Los avisos los crean los demás módulos con `NotificationsService.notify()`, dentro de la misma transacción que el cambio que los origina: nunca queda un aviso de algo que no pasó. La bandeja es la HU-62.

## Qué se notifica hoy (HU-62.1)

| Tipo en la base | Cuándo | A quién | Lleva a |
|---|---|---|---|
| `interest_received` | un prestador se interesa en una necesidad (HU-25) | cliente | la necesidad |
| `interest_selected` | el cliente elige a un interesado (HU-30) | prestador elegido | la contratación creada |
| `interest_not_selected` | el cliente elige a otro o cierra la necesidad (HU-30, HU-26.6) | los demás interesados | la necesidad |
| `request_received` | solicitud desde una publicación (HU-34) | prestador | la contratación |
| `request_accepted`, `request_rejected` | respuesta del prestador (HU-36) | cliente | la contratación |
| `request_confirmed` | el cliente confirma (HU-37) | las dos partes | la contratación |
| `request_auto_cancelled` | vence el plazo de 48 o 24 h (HU-35) | las dos partes | la contratación |

Los demás tipos del catálogo (pagos, reagendamiento, recordatorio, mensaje, verificación, reclamos…) ya tienen título y tema; aparecerán cuando sus épicas llamen a `notify()`.

## HU-62.2 · Mis notificaciones

`GET /api/notifications/mine` (con sesión): las 100 más recientes del **perfil activo**, de la más reciente a la más antigua. El contador de no leídas sale de `leida`.

```
[{ id, tipo, titulo, mensaje, fecha, leida, contratacionId: string | null, necesidadId: string | null }]
```

- `tipo` es el tema para la interfaz: `solicitud`, `contratacion`, `servicio`, `cancelacion`, `reagendamiento`, `recordatorio`, `mensaje`, `pago`, `interes`, `necesidad`, `verificacion` o `reclamo`. La traducción desde los 24 tipos de la base está en `notifications.constants.ts`.
- `titulo` es fijo por tipo (la tabla solo guarda el detalle, `message`, máx. 300).
- **Por perfil**, igual que las contrataciones y la agenda: una notificación de una contratación sale en el lado de quien la recibe (cliente o prestador); una de una necesidad, en el cliente si la necesidad es suya y en el prestador si es de otro; las de la cuenta, en los dos perfiles, salvo `verification_result`, que es solo del prestador.

## HU-62.3 · Marcar y enlazar

- `POST /api/notifications/:id/read` con `{ leida }` (por defecto `true`): marca una como leída o no leída. La de otra persona responde 404 `NOTIFICATION_NOT_FOUND`.
- `POST /api/notifications/read-all`: marca como leídas las no leídas del perfil activo → `{ actualizadas }`.
- Cada notificación lleva a su contratación (`contratacionId`) o a su necesidad (`necesidadId`). Para la necesidad se agregó la columna `notifications.related_need_id` (migración `20261024000001_notificacion_necesidad`).

Probado el 2026-10-24 en una base desechable: interés, solicitud, aceptación y selección; marcar, desmarcar, marcar todas; 404 con la de otra persona; y el filtro por perfil con un usuario que tiene los dos.
