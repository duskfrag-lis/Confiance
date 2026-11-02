/** HU-55: de 1 a 5 fotos del documento (D-54). */
export const MAX_VERIFICATION_PHOTOS = 5;

/** HU-55: columnas identity_verifications.document_number y additional_info. */
export const DOCUMENT_NUMBER_MAX_LENGTH = 30;
export const VERIFICATION_INFO_MAX_LENGTH = 500;

/** HU-58.3: columna identity_verifications.review_notes. */
export const REVIEW_REASON_MAX_LENGTH = 500;

/** HU-60: carpeta privada de las fotos de los documentos en el almacenamiento. */
export const IDENTITY_FOLDER = 'identity';

/** Estado de la verificación en la API; `sin_enviar` cuando el prestador nunca envió una. */
export type VerificationState = 'sin_enviar' | 'pendiente' | 'aprobada' | 'rechazada' | 'correccion';

/** Estados del catálogo verification_statuses. */
export const STATE_OF: Record<string, Exclude<VerificationState, 'sin_enviar'>> = {
  pending: 'pendiente',
  approved: 'aprobada',
  rejected: 'rechazada',
  correction_requested: 'correccion',
};

/** HU-58.2: lo que decide el administrador y el estado en que queda la solicitud. */
export const DECISIONS = ['aprobada', 'rechazada', 'correccion'] as const;
export type Decision = (typeof DECISIONS)[number];

export const STATUS_OF_DECISION: Record<Decision, string> = {
  aprobada: 'approved',
  rechazada: 'rejected',
  correccion: 'correction_requested',
};

/** Nombre legible de cada tipo del catálogo document_types (HU-55.1: no se pide el NIT). */
export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  cedula: 'Cédula de ciudadanía',
};
