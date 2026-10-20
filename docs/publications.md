# Publicaciones (E3)

Código en `backend/src/modules/publications/`. Cubre las publicaciones de servicio del prestador (HU-21 a HU-25), el catálogo general (HU-27) y las necesidades (HU-26, HU-28). Mostrar interés y elegir prestador (HU-29, HU-30) se agregan en la parte C.

## HU-21 a HU-25 · Mis publicaciones (`/api/listings`, perfil activo prestador)

Todas las rutas exigen sesión y el perfil activo de prestador (`RolesGuard`): un cliente recibe 403. Una publicación de otro prestador responde 404, igual que una que no existe.

Respuesta de una publicación:

```
{ id, titulo, oficio: { id, nombre }, descripcion, precioMin, precioMax, precioFijo, moneda: 'COP',
  estado: 'activo' | 'pausado' | 'rechazado' | 'retirado', acciones: ['editar' | 'pausar' | 'activar' | 'retirar'],
  fotos: [{ id, url }], creada, actualizada }
```

`acciones` dice qué botones mostrar en cada estado (HU-25.3 y regla 8 de la V7: la interfaz solo muestra las acciones permitidas). `precioFijo` es `true` cuando los dos precios son iguales (HU-21.2).

| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| GET | `/mine?estado=` | --- | HU-25: todas, también las retiradas, de la más reciente a la más antigua. `estado` es opcional |
| GET | `/mine/:id` | --- | Una propia, con los `id` de sus fotos para editarla |
| POST | `/` | multipart: `titulo`, `oficioId`, `descripcion`, `precioMin`, `precioMax` y de 1 a 5 `fotos` | HU-21: queda **activa** |
| PUT | `/:id` | JSON con los mismos campos (sin fotos) | HU-22: mismas validaciones que al crear |
| POST | `/:id/photos` | multipart: una `foto` | HU-22: hasta 5 |
| DELETE | `/:id/photos/:photoId` | --- | HU-22: siempre queda al menos una |
| POST | `/:id/pause` | --- | HU-23: solo una activa. Repetirla no hace nada |
| POST | `/:id/activate` | --- | HU-23: solo una pausada. Repetirla no hace nada |
| POST | `/:id/withdraw` | --- | HU-24: 204. Definitivo |

Validaciones (HU-21): título de máximo 150 caracteres, descripción de máximo 1000, el oficio debe ser **uno de los del perfil del prestador** (HU-14) y seguir activo en el catálogo (D-55), y los precios van en **pesos enteros** (COP, sin decimales), de 0 a 30 000 000, con el máximo mayor o igual que el mínimo. El oficio propio y el tope de 30 millones se decidieron el 2026-10-19; el docx V7 no se modifica. Fotos JPG o PNG de máximo 5 MB, comprobadas por su contenido y guardadas como WebP, igual que la foto de perfil (ver `docs/profiles.md`).

Reglas:

- **Editar** (HU-22) no cambia las contrataciones ya creadas: cada una guarda su propio valor y su dirección (HU-22.2, probado en vivo). El oficio solo se valida cuando cambia: si el prestador lo quitó de su perfil o se desactivó en el catálogo, la publicación sigue y se pueden editar los demás campos.
- **Fotos** (decidido el 2026-10-19): se agregan y se quitan de a una, en vez de reemplazar el juego completo. Agregar y quitar bloquean la fila de la publicación (`SELECT … FOR UPDATE`), así dos subidas a la vez no pasan de 5 (probado con 5 subidas simultáneas). Si una subida se rechaza, la foto que alcanzó a guardarse se borra.
- **Pausada** (HU-23): no sale en el catálogo ni en su detalle público, y la base no deja crear solicitudes sobre ella (`fn_service_request_before_write`). Las contrataciones que ya existían siguen su curso.
- **Retirar** (HU-24): solo si todas sus contrataciones están en COMPLETADO, CANCELADO o RECHAZADO; si no, 409 `LISTING_OPEN_CONTRACTS`. La base también lo impide (`fn_check_listing_status`), y si una contratación se abre justo entre la revisión y el cambio, la respuesta es la misma. Una retirada no se edita, no se activa y no recibe fotos. Se conserva (eliminación lógica), pero sus fotos pasan a `withdrawn/` y `/media` deja de servirlas, igual que las evidencias (HU-19.3, decidido el 2026-10-19). Retirarla otra vez termina de mover las fotos que hayan quedado públicas.
- **Rechazado** queda reservado para la moderación de la E17 (HU-25). Por ahora una rechazada solo puede retirarse.

Errores: `LISTING_PHOTOS`, `PRICE_RANGE`, `INVALID_CATEGORY`, `TRADE_NOT_OFFERED`, `PHOTO_COUNT`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE` (400); `LISTING_STATE`, `LISTING_OPEN_CONTRACTS` (409).

## HU-27 · Catálogo general (`/api/catalog`, sin sesión)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/listings?categoriaId=&pagina=&tamano=` | `{ total, pagina, tamano, resultados: [tarjeta] }`. Página de 20 por defecto, máximo 50 |
| GET | `/listings/:id` | La tarjeta con `fotos: string[]` (todas) en vez de `foto`. 404 si no está visible |

```
tarjeta = { id, titulo, descripcion, oficio: { id, nombre }, precioMin, precioMax, precioFijo, moneda,
            foto, prestador: { id, nombre, fotoUrl, calificacion: { promedio, cantidad }, verificado } }
```

- Solo publicaciones **activas** de cuentas **no deshabilitadas** (HU-27.1), de la más reciente a la más antigua.
- `categoriaId` puede ser una categoría (incluye todos sus oficios, D-55) o un oficio (HU-27.4).
- La calificación y la insignia (`verificado`) se calculan al consultar con la misma vista del perfil público (`v_provider_public_profile`). `prestador.id` lleva al perfil público (`GET /api/providers/:id`, HU-20).
- Nunca incluye cédula, correo, teléfono ni datos bancarios: la respuesta se arma campo por campo.

## HU-26 · Mis necesidades (`/api/needs`, perfil activo cliente)

| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| GET | `/mine?estado=` | --- | Todas, también las cerradas. `estado`: `abierta`, `prestador_seleccionado` o `cerrada` |
| GET | `/mine/:id` | --- | Una propia, con la dirección exacta |
| POST | `/` | multipart: `titulo`, `descripcion`, `oficioId`, `barrioId`, `direccion`, `fechaPreferida`, `presupuestoMin`, `presupuestoMax` y hasta 5 `fotos` (opcionales) | Queda **abierta** |
| POST | `/:id/close` | --- | HU-26.6: solo una abierta. Repetirla no hace nada |

Respuesta del dueño:

```
{ id, titulo, descripcion, oficio: { id, nombre }, zona: { barrioId, barrio, comunaId, comuna },
  fechaPreferida, presupuestoMin, presupuestoMax, moneda: 'COP', fotos: string[], publicada,
  direccion, estado, vencida, acciones: ['cerrar'] | [] }
```

Validaciones: título de máximo 150 caracteres, descripción de máximo 1000, dirección de máximo 255, oficio activo de segundo nivel (D-55), barrio activo de una comuna activa (la comuna sale del barrio), presupuesto en pesos enteros de 0 a 30 000 000 con el máximo mayor o igual que el mínimo, y fotos JPG o PNG de máximo 5 MB.

- **Fecha preferida:** debe ser futura (HU-26.2) y llevar hora y zona horaria (`2026-10-27T19:00:00-05:00`). Sin zona, el servidor la leería en su hora local y no en la de Colombia, así que se rechaza.
- **Una necesidad no se edita** (decidido el 2026-10-19): para cambiarla, el cliente la cierra y publica otra. Así un prestador nunca muestra interés en algo que después cambió.
- **Cerrar:** desde ese momento no recibe intereses (la base solo los acepta en una abierta, `fn_check_need_interest`). Si justo se eligió un prestador (HU-30), gana la elección y cerrar responde 409 `NEED_STATE`. Con un prestador ya elegido no se puede cerrar.
- **Fotos al cerrar** (decidido el 2026-10-19): pueden mostrar el interior de la casa del cliente, así que pasan a `withdrawn/` y `/media` deja de servirlas. **No se borran:** se conservan internamente por si una autoridad las solicita.
- **`vencida`:** `true` cuando sigue abierta pero la fecha ya pasó. Los prestadores ya no la ven, y el front puede sugerir cerrarla.

Errores: `BUDGET_RANGE`, `PAST_DATE`, `NEED_PHOTOS`, `INVALID_CATEGORY`, `INVALID_ZONE`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE` (400); `NEED_STATE` (409).

## HU-28 · Consulta de necesidades (`/api/needs`, perfil activo prestador)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/?categoriaId=&comunaId=&barrioId=&pagina=&tamano=` | `{ total, pagina, tamano, resultados }`, de la más reciente a la más antigua. Página de 20 por defecto, máximo 50 |
| GET | `/:id` | Detalle de una visible; si no, 404 |

- Solo necesidades **abiertas** de cuentas **no deshabilitadas** (HU-28.1), con **fecha preferida futura** (decidido el 2026-10-19: una vencida ya no se puede contratar, porque la base no crea solicitudes en el pasado) y que no sean del mismo usuario (una cuenta con los dos perfiles no ve las suyas).
- `categoriaId` acepta una categoría (incluye sus oficios, D-55) o un oficio. `comunaId` o `barrioId` filtran por zona (HU-28.2).
- Cada resultado trae título, descripción, oficio, zona, fecha preferida, presupuesto y fotos (HU-28.3). **Nunca** incluye la dirección exacta ni datos del cliente (HU-28.4): la respuesta se arma campo por campo.
