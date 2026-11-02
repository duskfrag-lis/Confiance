# Perfiles (E2, HU-11 y HU-13 a HU-20)

Código en `backend/src/modules/profiles/`. Todas las rutas de `/profiles` exigen sesión; las de cliente y prestador validan además el **perfil activo** con `RolesGuard` (HU-06): un cliente que pide el perfil de prestador recibe 403.

## Catálogos (`/api/catalogs`, sin sesión)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/zones` | `[{ id, nombre, barrios: [{ id, nombre }] }]`: comunas y barrios **activos** (HU-11, HU-16) |
| GET | `/availability` | `{ dias: [{ id: 'lunes'…, nombre }], bloques: [{ id: 'manana' \| 'tarde' \| 'noche', nombre, inicio, fin }] }` (HU-17, hora de Colombia) |

Los días y bloques van **por nombre**, no por número: así no se repite el desfase de JavaScript (0 = domingo) con la base (1 = lunes).

## Foto (`PUT /api/profiles/photo`, multipart, campo `foto`)

- JPG o PNG de máximo 5 MB. El formato se comprueba por el **contenido** del archivo, no por la extensión ni el tipo que manda el navegador.
- Se guarda optimizada como WebP (máximo 1200 px, sin agrandar, orientación EXIF aplicada y metadatos eliminados, GPS incluido) y reemplaza a la anterior, que se borra.
- Es de la cuenta: la misma foto se ve en el perfil de cliente y en el de prestador. `/auth/me` devuelve `fotoUrl`.
- Las fotos públicas se sirven en `GET /api/media/:archivo` sin sesión (para el perfil público, HU-20), con caché larga porque cada subida tiene un nombre nuevo. Los documentos privados (HU-55) **no** pasan por ahí.

Errores: `PHOTO_REQUIRED`, `PHOTO_COUNT`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE` (400). Los errores de multer (archivo demasiado grande, archivos de más) se traducen a estos códigos con `UploadErrorsInterceptor` (`backend/src/storage/`), para que el front nunca reciba un mensaje en inglés.

## HU-11 · Perfil del cliente (`/api/profiles/client`, perfil activo cliente)

| Método | Cuerpo | Respuesta |
|---|---|---|
| GET | --- | `{ nombres, apellidos, celular, correo, cedula, fotoUrl, zona: { barrioId, barrio, comunaId, comuna } \| null, direccion, descripcion }` |
| PUT | `{ nombres, apellidos, celular, barrioId?, direccion?, descripcion? }` | Igual que GET. `descripcion` máximo 200; el correo y la cédula no se editan |

## HU-13 a HU-17 · Perfil profesional (`/api/profiles/provider`, perfil activo prestador)

Cada sección se edita por separado (HU-13.2) y todas responden el perfil completo:

```
{ fotoUrl, descripcion, oficios: [{ id, nombre, categoria }],
  zonas: [{ comunaId, comuna, completa, barrios: [{ id, nombre }] }],
  disponibilidad: [{ dia, bloque }], evidencias, completo, faltantes: ['foto' | 'descripcion' | 'oficios' | 'zonas' | 'disponibilidad' | 'evidencias'] }
```

| Método | Ruta | Cuerpo |
|---|---|---|
| GET | `/provider` | --- (HU-13.3: `faltantes` dice qué secciones completar; sin descripción el perfil está incompleto, HU-15.2). `evidencias` cuenta solo las publicadas: si todas están retiradas, la sección vuelve a faltar |
| PUT | `/provider/description` | `{ descripcion }` (obligatoria, máximo 500) |
| PUT | `/provider/trades` | `{ oficios: string[] }` (1 a 3, oficios activos de segundo nivel, D-55) |
| PUT | `/provider/zones` | `{ barrios?: string[], comunas?: string[] }`: una comuna marca todos sus barrios activos (HU-16.2). Al menos un barrio. |
| PUT | `/provider/availability` | `{ franjas: [{ dia, bloque }] }`: reemplaza toda la semana. No afecta las contrataciones ya aceptadas (HU-17.3) |

Errores: `INVALID_ZONE`, `ZONES_REQUIRED`, `INVALID_CATEGORY` (400).

## HU-18 · Información bancaria

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/profiles/provider/bank-account` | prestador | `{ banco, tipoCuenta: 'ahorros' \| 'corriente', numero, editable }` o `null` (HU-18.1). `editable: false` mientras haya contrataciones en curso (D-58) |
| PUT | `/profiles/provider/bank-account` | prestador | `{ banco, tipoCuenta, numero }`. **Exige el correo verificado** (D-57, `VerifiedEmailGuard`): si no, 403 `EMAIL_NOT_VERIFIED`. **No se puede cambiar** si el prestador tiene alguna contratación en ACEPTADO, CONFIRMADO, EN_CURSO o FINALIZADO (D-58): 409 `BANK_ACCOUNT_LOCKED`. Registrarla por primera vez sí se permite. El número acepta espacios y guiones y se guarda solo con dígitos (6 a 20) |
| GET | `/profiles/providers/:id/bank-account` | cliente | Solo si tiene con ese prestador una contratación en ACEPTADO, CONFIRMADO, EN_CURSO o FINALIZADO (HU-18.2/18.3); si no, 403 `BANK_ACCOUNT_HIDDEN`. `null` si el prestador no la registró: solo se puede pagar por PSE (HU-18.5) |

Nunca aparece en el perfil público (HU-18.4).

**D-58** (decidido el 2026-10-18): en los estados en que el cliente ve los datos bancarios (HU-18.2), el prestador no puede cambiarlos, porque el cliente puede estar transfiriendo a esa cuenta. Ajusta la HU-18.1 ("siempre puede editar").

## HU-19 · Evidencias

| Método | Ruta | Notas |
|---|---|---|
| GET | `/profiles/provider/evidences` | Las propias, incluidas las retiradas (`retirada: true`, con `fotos` vacío) |
| POST | `/profiles/provider/evidences` | Multipart: `descripcion` (1 a 300) y `fotos` (1 a 5, JPG/PNG de 5 MB c/u). Se publica al instante, sin revisión (HU-19.2, D-42). Si una foto es inválida no se crea nada y se borran las ya subidas |
| POST | `/profiles/provider/evidences/:id/withdraw` | Solo las propias. Deja de mostrarse y se conserva; la base impide volver a publicarla. Sus fotos pasan de `public/` a `withdrawn/`, así que su enlace en `/media` deja de funcionar (404). Las copias que ya tenga el navegador de alguien pueden seguir en su caché |

Errores: `EVIDENCE_PHOTOS`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE` (400), 404 si no es tuya.

## HU-20 · Perfil público (`GET /api/providers/:id`, sin sesión)

```
{ id, nombre, fotoUrl, descripcion, oficios: [{ id, nombre }], zonas: [{ comuna, completa, barrios }],
  disponibilidad: [{ dia, bloque }], calificacion: { promedio, cantidad }, serviciosCompletados, verificado,
  publicaciones: [{ id, titulo, precioMin, precioMax }], evidencias: [{ id, descripcion, fecha, fotos }] }
```

- Nombre = primer nombre y primer apellido. Nunca cédula, correo, teléfono, NIT, datos bancarios ni documentos (HU-20.3): la respuesta se arma campo por campo.
- Calificación, insignia (HU-56) y servicios completados se calculan al consultar con la vista `v_provider_public_profile`, que además excluye las cuentas deshabilitadas: 404 (HU-20.4).
- Solo publicaciones activas y evidencias no retiradas. Mientras no existan las épicas de publicaciones y calificaciones, salen vacías o en cero.

HU-12 (historial del cliente) queda para la E5, porque depende de las contrataciones.
