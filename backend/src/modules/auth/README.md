# Módulo auth — autenticación genérica (correo y contraseña)

Cubre HU-01 a HU-07 y HU-68 (reCAPTCHA). OAuth (HU-67) se agrega después y reutiliza `SessionService`.

## Sesión

- `access_token` (cookie httpOnly, `path=/`): JWT de `JWT_ACCESS_EXPIRES`. Lo lee `JwtStrategy`; `request.user` es `AuthUser` (`userId`, `activeProfile`, `isAdmin`).
- `refresh_token` (cookie httpOnly, `path=/api/auth`): token opaco de `JWT_REFRESH_EXPIRES`, guardado como hash en `auth_tokens` (tipo `refresh_session`). Se rota en cada `/auth/refresh`. Si se reutiliza uno viejo, se cierran todas las sesiones del usuario.
- Las cookies son `SameSite=Lax`, y `Secure` en producción. El frontend debe enviar `withCredentials` (ya lo hace `credentials.interceptor`).
- Cuando el access token vence (respuesta 401), el frontend llama a `POST /auth/refresh` y reintenta. Si `refresh` también responde 401, hay que iniciar sesión de nuevo.

## Endpoints (`/api/auth`)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/register/client` | `RegisterClientPayload` | 201 `{ email }` |
| POST | `/register/provider` | `RegisterProviderPayload` (`oficios` = ids de `GET /api/categories`) | 201 `{ email }` |
| POST | `/login` | `{ email, password, captchaToken }` | 200 usuario (igual que `/me`) + cookies |
| POST | `/refresh` | --- | 204 + cookies nuevas |
| POST | `/logout` | --- | 204, borra las cookies |
| GET | `/me` | --- | 200 `{ id, email, nombres, apellidos, emailVerificado, perfilActivo, perfiles, esAdmin }` |
| POST | `/me/disable` | --- | 204 (HU-07), cierra todas las sesiones |
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
| `INVALID_CATEGORY` | 400 | Algún oficio no existe |
| `CAPTCHA_FAILED` | 400 | reCAPTCHA inválido |
| `INVALID_CREDENTIALS` | 401 | Correo o contraseña incorrectos (también si la cuenta se creó con Google o Microsoft) |
| `ACCOUNT_DISABLED` | 403 | La cuenta está deshabilitada (se comprueba después de validar la contraseña) |
| `SESSION_EXPIRED` | 401 | `refresh` sin token, o con un token vencido o revocado |
| `INVALID_TOKEN` | 400 | Enlace de restablecimiento inválido, vencido o ya usado |

Los errores de validación de los DTO usan el formato estándar de Nest: `message: { message: string[] }`.

## Desarrollo

- Sin una clave real de Resend (`re_...`), los correos se escriben en la consola con su enlace.
- `RECAPTCHA_SECRET_KEY` de `.env.example` es la clave de prueba de Google, que acepta cualquier token. Funciona junto con la `recaptchaSiteKey` de prueba del frontend.
- Requiere la migración `20261009000001_token_type_refresh`.
