import { HttpException, HttpStatus } from '@nestjs/common';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

// Límite más estricto que el global (100/min) para rutas expuestas a fuerza bruta o abuso
export const STRICT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// El refresh token solo viaja a las rutas de autenticación: el resto de la API nunca lo recibe
export const REFRESH_COOKIE_PATH = '/api/auth';

// Valores sembrados en el catálogo token_types (migración seed_catalogs). `refresh_session` ya no se
// usa: las sesiones viven en user_sessions (migración sesiones_por_dispositivo)
export const TokenType = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;
export type TokenTypeName = (typeof TokenType)[keyof typeof TokenType];

export const AccountStatus = {
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export const Profile = {
  CLIENT: 'client',
  PROVIDER: 'provider',
} as const;
export type ProfileName = (typeof Profile)[keyof typeof Profile];

/** Inicio de cada perfil en la SPA (mismo valor que HOME_BY_PROFILE del frontend). */
export const HOME_BY_PROFILE: Record<ProfileName, string> = {
  client: '/cliente',
  provider: '/prestador',
};

/** D-33 y Ley 1581: deja constancia (fecha y usuario) de la aceptación de términos al registrarse. */
export const termsAcceptedEvent = (userId: bigint) => ({
  actor_id: userId,
  event_type: 'terms_accepted',
  entity_type: 'users',
  entity_id: userId,
});

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // HU-04

// Mismas reglas que PASSWORD_RULES del frontend (auth-forms.ts)
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%]).{6,20}$/;
export const PASSWORD_MESSAGE =
  'La contraseña debe tener entre 6 y 20 caracteres, una mayúscula, una minúscula, un número y un carácter especial (! @ # $ %).';

// Códigos que el frontend usa para mostrar cada error (models/auth.models.ts)
export type AuthErrorCode =
  | 'EMAIL_TAKEN'
  | 'CEDULA_TAKEN'
  | 'NIT_TAKEN'
  | 'INVALID_CATEGORY'
  | 'CAPTCHA_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'SESSION_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TRADES_REQUIRED'
  | 'OPEN_CONTRACTS'
  | 'EMAIL_NOT_VERIFIED';

export function authError(status: HttpStatus, code: AuthErrorCode, message: string) {

  return new HttpException({ code, message }, status);
}
