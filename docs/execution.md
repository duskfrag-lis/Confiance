# Ejecución del servicio (E9, HU-46 a HU-48)

Código en `backend/src/modules/execution/`. La máquina de estados, el inicio del plazo de 24 h y el paso a COMPLETADO viven en la base; el backend revisa quién y cuándo, y avisa en la misma transacción. Los auxiliares de transacción (bloquear la contratación, fijar el actor, mover de estado) son los mismos de la E5: `contracting/contract-tx.ts`.

## Endpoints

Todos con sesión. Responden `{ id, estado, fechaHora, valor }`; la interfaz recarga el detalle con `GET /api/contracts/:id`. A quien no es parte, 404; en otro estado, 409 `REQUEST_STATE`.

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/api/contracts/:id/start` | prestador (perfil activo) | HU-46: CONFIRMADO → EN_CURSO; la cita pasa a en curso (HU-40) y se avisa al cliente |
| POST | `/api/contracts/:id/finish` | prestador | HU-47.1: EN_CURSO → FINALIZADO; la base guarda `completion_requested_at` (empieza el plazo de 24 h) y se pide al cliente que confirme y pague |
| POST | `/api/contracts/:id/confirm-completion` | cliente | HU-47.2: confirmación manual, una sola vez (409 `COMPLETION_CONFIRMED`); si ya está pagada, pasa a COMPLETADO en el acto |
| POST | `/api/contracts/:id/report` | cualquiera de las partes | HU-48: `{ descripcion }` (1 a 1000) en FINALIZADO o COMPLETADO |

## HU-47 · Cuándo queda COMPLETADO

Con la confirmación del cliente (manual o automática) **y** el pago en PAGADO, en cualquier orden (HU-47.5). Lo hace la base (`fn_try_complete_service_request`) al registrar la confirmación y al quedar pagado el pago. Cada confirmación guarda si fue manual o automática (`completion_confirmations.is_automatic`, HU-47.6). El prestador no confirma: marca el servicio como finalizado.

## Proceso programado (cada 5 minutos, `ExecutionScheduler`)

- **Confirmación automática (HU-47.3):** a las 24 h de la finalización, `fn_auto_complete_service_requests` registra la confirmación del cliente, salvo que el cliente haya reportado un problema (HU-47.4, HU-48.4). Avisa a las dos partes y, si ya estaba pagada, que quedó completada.
- **Recordatorio de inicio (HU-46.3):** si llegó la hora de la cita y la contratación sigue en CONFIRMADO, avisa una vez al prestador (`service_start_reminder`).

## En el detalle (`GET /api/contracts/:id`)

- `reporte`: el último problema reportado, `{ por: 'cliente' | 'prestador', descripcion, fecha }` o `null` (HU-48.3).
- `plazo` de `confirmacion_finalizacion`: desaparece si el cliente ya confirmó o si reportó un problema (ya no corre la confirmación automática). Un reporte del prestador no lo detiene.

## Avisos (HU-62)

| Tipo | Cuándo | A quién |
|---|---|---|
| `service_started` | inicio | cliente |
| `completion_requested` | finalización | cliente |
| `completion_confirmed` | confirmación manual (al prestador) o automática (a los dos) | — |
| `request_completed` | queda COMPLETADO al confirmar | las dos partes |
| `service_start_reminder` | llegó la hora y no ha iniciado | prestador |

`service_started`, `completion_confirmed` y `request_completed` son nuevos (migración `20261024000002_avisos_ejecucion`). El paso a COMPLETADO cuando el pago llega después de la confirmación lo avisará la E8 (pagos).
