# Verificación de identidad (E13, HU-55, HU-56 y HU-58)

Código en `backend/src/modules/verification/`. La base ya aplica dos reglas: una sola solicitud pendiente por prestador (`fn_check_identity_verification`) y máximo 5 fotos (`trg_max_identity_verification_photos`). La insignia (HU-56) sale de las vistas `v_provider_public_profile` y `v_service_listing_catalog`: aparece si la verificación **más reciente** está aprobada.

## Prestador (HU-55)

Rutas con sesión y perfil de prestador activo.

- `GET /api/verification/document-types`: `[{ id, nombre }]`. Hoy solo cédula; no se pide el NIT (HU-55.1).
- `GET /api/verification/mine`: `{ estado, actual, anteriores }`. `estado` es `sin_enviar`, `pendiente`, `aprobada`, `rechazada` o `correccion`, y sale de la solicitud más reciente. Cada solicitud trae `{ id, tipoDocumento, numero, fotos, informacion, estado, enviada, revisada, motivo }`. `motivo` es el que escribió el administrador (HU-55.4).
- `POST /api/verification` (multipart, exige correo verificado, D-57): `tipoDocumento`, `numero`, `informacion` (opcional, 500 como máximo) y de 1 a 5 fotos en `fotos` (JPG o PNG de 5 MB como máximo). Queda `pendiente` y responde lo mismo que `mine`.
  - La cédula debe tener de 6 a 10 dígitos (D-51). Se aceptan puntos y espacios, que se quitan.
  - Errores: `PHOTOS_REQUIRED`, `VERIFICATION_PHOTOS`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_DOCUMENT_TYPE`, `INVALID_DOCUMENT_NUMBER` y `EMAIL_NOT_VERIFIED`. Con una pendiente, 409 `VERIFICATION_PENDING` (HU-55.3). Con la identidad ya aprobada, 409 `ALREADY_VERIFIED`: una solicitud nueva sería la más reciente y quitaría la insignia.
  - Tras un rechazo o una corrección sí se envía una nueva (HU-55.4).
- `GET /api/profiles/provider` trae `verificacion`: el estado de la más reciente, o `null`.

## Administrador (HU-58)

Rutas con `users.is_admin` (D-11). Cualquier otro usuario recibe 403.

- `GET /api/admin/verifications`: las pendientes, de la más antigua a la más reciente (HU-58.1). Cada una trae `{ id, prestador: { nombre, fotoUrl }, tipoDocumento, numero, fotos, informacion, enviada, coincideConRegistro, anteriores }`.
  - `coincideConRegistro` dice si el número es la cédula del registro, sin mostrar esa cédula.
  - `anteriores` es cuántas solicitudes envió antes el prestador.
- `POST /api/admin/verifications/:id/review` con `{ decision, motivo }`. `decision` es `aprobada`, `rechazada` o `correccion`. El motivo es obligatorio para rechazar o pedir corrección (400 `REASON_REQUIRED`, HU-58.3).
  - Guarda el estado, el administrador (`reviewed_by`), el motivo (`review_notes`) y la fecha (`updated_at`). Avisa al prestador con `verification_result` y el motivo (HU-58.4).
  - Responde `{ id, estado, revisada }`.
  - Si ya fue revisada, 409 `VERIFICATION_REVIEWED`; dos administradores a la vez se bloquean con `FOR UPDATE`. Si es la propia, 403. Si no existe, 404.

## Fotos privadas (HU-60)

- Las fotos del documento se guardan en `private/identity/` del bucket, reencodadas (sin metadatos, GPS incluido). `/media/:file` no las sirve.
- Solo se entregan con un enlace firmado `GET /api/media/private/:carpeta/:archivo?e=<vence>&s=<firma>`. Lo arma `StorageService.signedUrl()` y solo se entrega a quien puede ver el archivo: el prestador dueño y el administrador.
- La firma es HMAC-SHA256 con una clave derivada de `JWT_ACCESS_SECRET`. El enlace dura de 10 a 15 minutos: el vencimiento se redondea a bloques de 5 minutos para que el navegador pueda guardarlo en caché.
- Un enlace vencido, alterado o de otro archivo responde 404, sin dar pistas.
- La entrega pasa por la API, así que funciona aunque el almacenamiento no sea accesible desde el navegador (por ejemplo, en Docker). La misma ruta sirve para las evidencias de fuerza mayor (`private/force-majeure/`, HU-59).

Probado el 2026-10-24 en una base desechable:

- Envío con cada error, pendiente, segunda pendiente y correo sin verificar.
- Enlace firmado: 200 válido; 404 alterado, sin firma o por `/media`.
- Panel: 403 a cliente y prestador; la lista muestra `coincideConRegistro`.
- Revisión: corrección sin motivo; corrección con aviso; revisión repetida.
- Ciclo completo: nueva solicitud, aprobación, insignia en el perfil público, el catálogo y la búsqueda, y `ALREADY_VERIFIED`.
- Las fotos rechazadas no quedan en el bucket.
