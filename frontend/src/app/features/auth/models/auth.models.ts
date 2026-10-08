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
}

export interface LoginPayload {
  email: string;
  password: string;
  captchaToken: string;
}

export type RegisterErrorCode = 'EMAIL_TAKEN' | 'CEDULA_TAKEN' | 'CAPTCHA_FAILED' | 'UNKNOWN';

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
}
