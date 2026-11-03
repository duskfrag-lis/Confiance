# Calificaciones (E10 · HU-49)

Al terminar una contratación, cada parte califica a la otra una vez: de 1 a 5 estrellas y un comentario opcional.

## Endpoint

`POST /api/contracts/:id/rating` con `{ "puntaje": 5, "comentario": "texto o null" }`. Responde el resumen de la
contratación (`{ id, estado, fechaHora, valor }`).

- Lo usan las dos partes (sin `@Roles`). El cuerpo no dice a quién se califica: el servidor califica siempre a la
  otra parte.
- `puntaje`: entero de 1 a 5. `comentario`: hasta 300 caracteres; vacío o con solo espacios se guarda como `null`.
- No se puede editar ni borrar una calificación.

| Error | Cuándo |
|---|---|
| 400 | Puntaje fuera de 1 a 5, decimal, o comentario de más de 300 caracteres |
| 404 | Quien califica no es parte de la contratación |
| 409 `REQUEST_STATE` | La contratación no está en COMPLETADO (también si cambia justo antes de guardar: lo frena `fn_check_rating`) |
| 409 `ALREADY_RATED` | Esa persona ya calificó esa contratación (`UNIQUE (service_request_id, rated_by)`) |

## Campos nuevos

- **Detalle** `GET /api/contracts/:id`: `calificacion: { puntaje, comentario, fecha } | null`, la que dio quien
  consulta. Cuando existe, la acción `calificar` deja de salir.
- **Perfil público** `GET /api/providers/:id`: `resenas: [{ autor, puntaje, comentario, fecha }]`, las 10 más recientes
  recibidas **como prestador en ese perfil** (las que recibe como cliente no salen, HU-49.3). Del autor, nombre e
  inicial del apellido ("Ana G."). El promedio sigue saliendo de `v_provider_rating_summary`.

## Frontend

Se quitó `core/mock/contracts-mock.interceptor.ts` y la acción `calificar` pasa a la lista de acciones reales: ya no
queda nada simulado de las contrataciones.
