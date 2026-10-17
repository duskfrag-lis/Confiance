# API de autenticación (módulo `auth`)

Cubre HU-01 a HU-10 de la V7: registro, inicio y cierre de sesión, recuperación de contraseña, verificación de correo, control de acceso por perfil, deshabilitación, cambio de perfil, Google y Microsoft, y reCAPTCHA.

## Estructura

| Carpeta | Contenido |
|---|---|
| `backend/src/modules/auth/` | `auth.module.ts`, `auth.controller.ts`, `auth.service.ts` y `auth.constants.ts` |
| `dto/` | Validación de los cuerpos de registro, login, recuperación y cambio de perfil |
| `session/` | `SessionService` (cookies y tokens), `AuthTokensService` (tokens de un solo uso) y `JwtStrategy` |
| `captcha/` | `CaptchaService` (reCAPTCHA, HU-10) |
| `social/` | Google y Microsoft (HU-09) |

La validación de oficios (`assertTrades`, D-55) está en `backend/src/modules/categories/trades.ts`, porque también la usan perfiles y publicaciones.

## Sesión

Sesiones por dispositivo (HU-03, RFC 9700): cada inicio de sesión es una fila de `user_sessions` (PC, celular…). La misma cuenta puede tener varias abiertas.

- `access_token` (cookie httpOnly, `path=/`, sin `Max-Age`): JWT de `JWT_ACCESS_EXPIRES` con `sid` (la fila de `user_sessions`). `JwtStrategy` comprueba en cada petición que la cuenta no esté deshabilitada y que esa sesión siga abierta, así que cerrar una sesión la corta al instante. `request.user` es `AuthUser` (`userId`, `sessionId`, `activeProfile`, `isAdmin`).
- `refresh_token` (cookie httpOnly, `path=/api/auth`): token opaco; en la base solo queda su hash (`user_sessions.refresh_token_hash`). Se rota en cada `/auth/refresh` dentro de la misma fila.
- "Mantener la sesión" (`recordar`, columna `remember`): la sesión vence tras `JWT_REFRESH_EXPIRES` (30 d) **sin usarse**, porque cada renovación reinicia el plazo, y la cookie es persistente. Sin marcarla, dura como máximo 12 h y la cookie no lleva `Max-Age`, así que el navegador la borra al cerrarse.
- Token ya rotado que vuelve a usarse: si llega dentro de 10 s (`REFRESH_REUSE_GRACE_MS`) es otra pestaña del mismo navegador y recibe un access token nuevo sin tocar la cookie de refresh. Después de eso se trata como robado y se cierra **solo esa sesión**; las de los otros dispositivos siguen.
- `/auth/logout` cierra solo la sesión del dispositivo. Se cierran todas al restablecer la contraseña, al deshabilitar la cuenta y al vincular una cuenta sin correo verificado (D-47).
- Las cookies son `SameSite=Lax`, y `Secure` en producción. El frontend debe enviar `withCredentials` (ya lo hace `credentials.interceptor`).
- Cuando el access token vence (respuesta 401), el frontend llama a `POST /auth/refresh` y reintenta. Si `refresh` también responde 401 y había sesión, `refresh.interceptor` lleva a `/auth/iniciar-sesion?sesion=expirada&volver=<ruta>`.
- Migración `20261017000001_sesiones_por_dispositivo`: agrega `remember`, `previous_token_hash` y `rotated_at` a `user_sessions`, invalida las sesiones del esquema anterior (estaban en `auth_tokens`, tipo `refresh_session`) y elimina `users.sessions_revoked_at`. `auth_tokens` queda solo para los enlaces de correo.

## Correo verificado (D-57)

`VerifiedEmailGuard` (`common/guards/verified-email.guard.ts`) responde 403 `EMAIL_NOT_VERIFIED` si la cuenta no tiene el correo verificado. Se usa después de `JwtAuthGuard` en los endpoints de información bancaria (HU-18) y documentos de identidad (HU-55): así, quien crea una cuenta con un correo ajeno no puede dejar ahí sus datos. Una cuenta sin verificar sí puede iniciar sesión.

## Endpoints (`/api/auth`)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/register/client` | `RegisterClientPayload` | 201 `{ email }` |
| POST | `/register/provider` | `RegisterProviderPayload` (`oficios` = ids de `GET /api/categories`) | 201 `{ email }` |
| POST | `/login` | `{ email, password, captchaToken, recordar? }` | 200 usuario (igual que `/me`) + cookies |
| POST | `/refresh` | --- | 204 + cookies nuevas |
| POST | `/logout` | --- | 204, borra las cookies |
| GET | `/me` | --- | 200 `{ id, email, nombres, apellidos, emailVerificado, perfilActivo, perfiles, esAdmin, revisarPerfil }` |
| GET | `/me/personal-data` | --- | 200 `{ nombres, apellidos, cedula, telefono, prestador: { nit, oficios } \| null }` (D-47) |
| PUT | `/me/personal-data` | `{ nombres, apellidos, cedula, telefono, nit?, oficios? }` (`oficios` obligatorio si tiene perfil de prestador) | 200 usuario (igual que `/me`) con `revisarPerfil: false`. 400 `TRADES_REQUIRED`, 409 `CEDULA_TAKEN` / `NIT_TAKEN` |
| POST | `/me/profile` | `{ perfil: 'client' \| 'provider', oficios?, nit? }` | 200 usuario (igual que `/me`) + cookie de acceso nueva (HU-08). La primera vez que se activa el perfil de prestador exige `oficios` |
| POST | `/me/disable` | --- | 204 (HU-07), cierra todas las sesiones. 409 `OPEN_CONTRACTS` si hay contrataciones sin cerrar (D-52) |
| GET | `/verify-email?token=` | --- | 302 a `FRONTEND_URL/auth/iniciar-sesion?correo=verificado` o `?correo=enlace-invalido` |
| POST | `/resend-verification` | `{ email }` | 204 siempre |
| POST | `/forgot-password` | `{ email, captchaToken }` | 204 siempre; el enlace va a `FRONTEND_URL/auth/restablecer-contrasena?token=` (30 min, un solo uso) |
| POST | `/reset-password` | `{ token, password }` | 204, cierra todas las sesiones |

Todas las respuestas pasan por `TransformInterceptor` (`{ success, data }`).

## Errores

Los errores de negocio llegan como `{ success: false, statusCode, message: { code, message } }`:

| Código | HTTP | Cuándo |
|---|---|---|
| `EMAIL_TAKEN`, `CEDULA_TAKEN`, `NIT_TAKEN` | 409 | Registro con datos ya usados |
| `INVALID_CATEGORY` | 400 | Algún oficio no existe, está inactivo o no es de segundo nivel (D-55) |
| `TRADES_REQUIRED` | 400 | Se activa el perfil de prestador sin oficios (HU-08) |
| `OPEN_CONTRACTS` | 409 | Se intenta deshabilitar la cuenta con contrataciones de SOLICITADO a FINALIZADO (D-52) |
| `CAPTCHA_FAILED` | 400 | reCAPTCHA inválido |
| `INVALID_CREDENTIALS` | 401 | Correo o contraseña incorrectos (también si la cuenta se creó con Google o Microsoft) |
| `ACCOUNT_DISABLED` | 403 | La cuenta está deshabilitada (se comprueba después de validar la contraseña) |
| `SESSION_EXPIRED` | 401 | `refresh` sin token, o con un token vencido, revocado o robado |
| `EMAIL_NOT_VERIFIED` | 403 | Paso que exige el correo verificado (D-57) |
| `INVALID_TOKEN` | 400 | Enlace de restablecimiento inválido, vencido o ya usado |

Los errores de validación de los DTO usan el formato estándar de Nest: `message: { message: string[] }`.

## Desarrollo

- Sin una clave real de Resend (`re_...`), los correos se escriben en la consola con su enlace.
- `RECAPTCHA_SECRET_KEY` de `.env.example` es la clave de prueba de Google, que acepta cualquier token. Funciona junto con la `recaptchaSiteKey` de prueba del frontend.
- Requiere las migraciones hasta `20261017000001_sesiones_por_dispositivo` (`npx prisma migrate deploy`).

## OAuth: Google y Microsoft (HU-67)

Código en `social/`. Reutiliza `SessionService.start()`, así que la sesión es la misma que la del login con contraseña.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/google?rol=cliente\|prestador&recordar=1&volver=/ruta` y `/microsoft?…` (todo opcional) | 302 al proveedor (guarda `state`, `rol`, `recordar` y `volver` en la cookie `oauth_state`, 10 min, un solo uso). `volver` solo acepta rutas internas (`/…`, nunca `//…`) |
| GET | `/google/callback`, `/microsoft/callback` | Siempre 302 a la SPA: con sesión, a `volver` o al inicio del perfil activo (`/cliente`, `/prestador`); `/auth/completar-perfil?rol=` si el correo es nuevo (el registro pendiente guarda `recordar`; `/social/pending` lo devuelve y `/social/complete` acepta `recordar` para cambiarlo), o `/auth/iniciar-sesion?error=` |
| GET | `/social/pending` | `{ provider, email, nombres, apellidos }` o 401 `SESSION_EXPIRED` |
| POST | `/social/complete` | `CompleteSocialPayload` → 204 + cookies. Errores como el registro (`CEDULA_TAKEN`, `NIT_TAKEN`, `INVALID_CATEGORY`…) |
| POST | `/social/cancel` | 204, descarta el registro pendiente |

Valores de `?error=`: `cuenta-deshabilitada` y `social`.

Decisiones:
- Si el correo verificado por el proveedor ya pertenece a una cuenta, se vincula la identidad y se inicia sesión. Si esa cuenta no tenía el correo verificado, se elimina su contraseña, porque pudo ponerla otra persona (D-47). Queda el evento `identity_linked`, se cierran todas las sesiones de esa cuenta y se marca `users.profile_review_required`: y el dueño debe confirmar nombres, cédula, celular y, si es prestador, oficios y NIT en `/auth/revisar-perfil` antes de entrar a cualquier página privada (`authGuard`).
- Microsoft solo con cuentas personales (`MICROSOFT_TENANT=consumers`); con otro tenant el correo no se da por verificado.
- La aceptación de términos queda en `audit_events` (`terms_accepted`), igual que en el registro con contraseña (D-33).
