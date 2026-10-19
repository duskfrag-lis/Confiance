# Publicaciones (E3)

Código en `backend/src/modules/publications/`. Este documento cubre la parte A: publicaciones de servicio del prestador (HU-21 a HU-25) y el catálogo general (HU-27). Las necesidades (HU-26, HU-28) y la selección de prestador (HU-29, HU-30) se agregan en las partes B y C.

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

Validaciones (HU-21): título de máximo 150 caracteres, descripción de máximo 1000, oficio activo del segundo nivel del catálogo (D-55), precios en **pesos enteros** (COP, sin decimales), ninguno negativo y el máximo mayor o igual que el mínimo. Fotos JPG o PNG de máximo 5 MB, comprobadas por su contenido y guardadas como WebP, igual que la foto de perfil (ver `docs/profiles.md`).

Reglas:

- **Editar** (HU-22) no cambia las contrataciones ya creadas: cada una guarda su propio valor y su dirección (HU-22.2, probado en vivo). Si el oficio de la publicación se desactiva en el catálogo, se pueden seguir editando los demás campos; solo se valida el oficio cuando cambia.
- **Fotos** (decidido el 2026-10-19): se agregan y se quitan de a una, en vez de reemplazar el juego completo. Agregar y quitar bloquean la fila de la publicación (`SELECT … FOR UPDATE`), así dos subidas a la vez no pasan de 5 (probado con 5 subidas simultáneas). Si una subida se rechaza, la foto que alcanzó a guardarse se borra.
- **Pausada** (HU-23): no sale en el catálogo ni en su detalle público, y la base no deja crear solicitudes sobre ella (`fn_service_request_before_write`). Las contrataciones que ya existían siguen su curso.
- **Retirar** (HU-24): solo si todas sus contrataciones están en COMPLETADO, CANCELADO o RECHAZADO; si no, 409 `LISTING_OPEN_CONTRACTS`. La base también lo impide (`fn_check_listing_status`), y si una contratación se abre justo entre la revisión y el cambio, la respuesta es la misma. Una retirada no se edita, no se activa y no recibe fotos. Se conserva (eliminación lógica), pero sus fotos pasan a `withdrawn/` y `/media` deja de servirlas, igual que las evidencias (HU-19.3, decidido el 2026-10-19). Retirarla otra vez termina de mover las fotos que hayan quedado públicas.
- **Rechazado** queda reservado para la moderación de la E17 (HU-25). Por ahora una rechazada solo puede retirarse.

Errores: `LISTING_PHOTOS`, `PRICE_RANGE`, `INVALID_CATEGORY`, `PHOTO_COUNT`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE` (400); `LISTING_STATE`, `LISTING_OPEN_CONTRACTS` (409).

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
