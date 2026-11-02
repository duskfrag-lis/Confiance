# Búsqueda (E4, HU-31 a HU-33)

Código en `backend/src/modules/search/`. No requiere sesión (HU-31.3, D-46).

## `GET /api/search/listings`

Todos los parámetros son opcionales y se combinan (HU-33.2):

| Parámetro | Qué hace |
|---|---|
| `q` | Texto (máximo 100 caracteres). Cada palabra debe aparecer en el título, la descripción o el nombre del oficio de la publicación, sin distinguir mayúsculas ni tildes (HU-31.1). Se usan las primeras 5 palabras |
| `categoriaId` | Una categoría (incluye todos sus oficios, D-55) o un oficio (HU-31.2) |
| `comunaId` / `barrioId` | Zona de atención del prestador (HU-16): un barrio, o cualquier barrio de la comuna |
| `precioMin` / `precioMax` | Pesos enteros. Sale la publicación cuyo rango de precio se cruza con el pedido: `precioMax` de la publicación ≥ `precioMin` y `precioMin` de la publicación ≤ `precioMax` |
| `calificacionMin` | 1 a 5. Un prestador sin calificaciones tiene promedio 0 y no sale con este filtro |
| `fecha` | `AAAA-MM-DD`, de hoy en adelante (hora de Colombia). Sale el prestador que tiene al menos un bloque configurado ese día de la semana que no esté ocupado (HU-33.3) |
| `soloVerificados` | `true`: solo prestadores con la insignia de verificado |
| `pagina` / `tamano` | Como en el catálogo: 20 por defecto, máximo 50 |

Respuesta:

```
{ total, pagina, tamano, resultados: [tarjeta], sugerencia: 'publicar_necesidad' | null }
```

- `resultados` usa **la misma tarjeta del catálogo** (HU-27, ver `docs/publications.md`): título, oficio, precio (rango o fijo), prestador, calificación promedio e insignia (HU-32.1). Solo publicaciones activas de cuentas no deshabilitadas, con el oficio y su categoría activos.
- **Orden (HU-32.2):** primero las que tienen más palabras del texto en el título; a igual coincidencia, la mayor calificación y después la más reciente. Sin texto, por calificación.
- **Sin resultados (HU-32.3):** `sugerencia: 'publicar_necesidad'`, para que el front ofrezca publicar una necesidad (HU-26).
- La calificación y la insignia se calculan al consultar (vista `v_provider_public_profile`).

Errores: `PRICE_RANGE` (rango invertido) y `PAST_DATE` (fecha anterior a hoy) (400), además de las validaciones de cada parámetro.

## Detalles de implementación

- **Sin tildes:** la consulta compara `translate(lower(columna), 'áéíóú…ñ', 'aeiou…n')` contra el texto normalizado igual en el backend (`normalizeText`). No depende de la extensión `unaccent`, así que no hizo falta una migración. La ñ se iguala a la n: "pena" encuentra "peña".
- El texto se compara con `strpos`, no con `LIKE`: un `%` o un `_` que escriba el usuario no funciona como comodín. Todo va como parámetro de la consulta, nunca concatenado.
- **Ocupado** es lo mismo que usa la base al aceptar una contratación (`fn_provider_slot_taken`): un bloque con una contratación en ACEPTADO, CONFIRMADO o EN_CURSO ese día. Una cancelada o rechazada libera el bloque.
- Si una publicación se pausa entre la búsqueda y el armado de las tarjetas, simplemente no sale.
