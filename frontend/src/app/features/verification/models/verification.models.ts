export type VerificationState = 'sin_enviar' | 'pendiente' | 'aprobada' | 'rechazada' | 'correccion';

export interface DocumentType {
  id: string;
  nombre: string;
}

export interface VerificationRequest {
  id: string;
  tipoDocumento: DocumentType;
  numero: string;
  fotos: string[];
  informacion: string | null;
  estado: Exclude<VerificationState, 'sin_enviar'>;
  enviada: string;
  revisada: string | null;
  motivo: string | null;
}

export interface VerificationApi {
  estado: VerificationState;
  actual: VerificationRequest | null;
  anteriores: VerificationRequest[];
}

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ['image/jpeg', 'image/png'];
export const MAX_INFO = 500;
export const MAX_NUMBER = 30;

export const STATE_LABEL: Record<VerificationState, string> = {
  sin_enviar: 'Sin enviar',
  pendiente: 'En revisión',
  aprobada: 'Verificada',
  rechazada: 'Rechazada',
  correccion: 'Corrección solicitada',
};
