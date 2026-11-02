export interface RegisterClientPayload {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  email: string;
  password: string;
  aceptaTerminos: true;
  captchaToken: string;
}

export interface RegisterProviderPayload extends RegisterClientPayload {
  oficios: string[];
  nit: string | null;
}

export interface RegisterResponse {
  email: string;
}

export interface Trade {
  id: string;
  name: string;
  group: string;
  groupId: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  captchaToken: string;
  /** Mantener la sesión al cerrar el navegador */
  recordar: boolean;
}

/** Lo que el inicio de sesión con Google o Microsoft lleva hasta el callback */
export interface SocialLoginOptions {
  rol?: AccountRole | null;
  recordar?: boolean;
  /** Ruta interna a la que volver después de iniciar sesión */
  volver?: string | null;
}

export type RegisterErrorCode =
  | 'EMAIL_TAKEN'
  | 'CEDULA_TAKEN'
  | 'NIT_TAKEN'
  | 'INVALID_CATEGORY'
  | 'CAPTCHA_FAILED'
  | 'UNKNOWN';

export type LoginErrorCode =
  'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' | 'CAPTCHA_FAILED' | 'UNKNOWN';

export class RegisterError extends Error {
  constructor(readonly code: RegisterErrorCode) {
    super(code);
  }
}

export class LoginError extends Error {
  constructor(readonly code: LoginErrorCode) {
    super(code);
  }
}

export type SocialProvider = 'google' | 'microsoft';
export type AccountRole = 'cliente' | 'prestador';

export interface SocialPending {
  provider: SocialProvider;
  email: string;
  nombres: string;
  apellidos: string;
  /** "Recuérdame" elegido en el login antes de salir al proveedor */
  recordar: boolean;
}

/** D-47: datos que el dueño confirma tras vincular una cuenta sin correo verificado */
export interface PersonalData {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  /** Solo si la cuenta tiene perfil de prestador */
  prestador: { nit: string | null; oficios: string[] } | null;
}

export interface PersonalDataPayload {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  nit?: string | null;
  oficios?: string[];
}

export interface CompleteSocialPayload {
  rol: AccountRole;
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  aceptaTerminos: true;
  oficios?: string[];
  nit?: string | null;
  recordar: boolean;
}
