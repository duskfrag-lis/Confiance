export interface RegisterClientPayload {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  email: string;
  password: string;
  aceptaTerminos: true;
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
}

export type RegisterErrorCode = 'EMAIL_TAKEN' | 'CEDULA_TAKEN' | 'UNKNOWN';

export type LoginErrorCode = 'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' | 'UNKNOWN';

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
