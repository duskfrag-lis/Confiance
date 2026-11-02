import type { RequestState } from '../contracting/contracting.constants';

/** HU-54: descripción de 1000 como máximo y hasta 5 fotos (D-54). */
export const CLAIM_DESCRIPTION_MAX_LENGTH = 1000;
export const MAX_CLAIM_PHOTOS = 5;

/** HU-57.4: la resolución aplicada en cada cambio de estado (columna claim_status_history.note). */
export const CLAIM_RESOLUTION_MAX_LENGTH = 1000;

/** HU-60: carpeta privada de las fotos de los reclamos en el almacenamiento. */
export const CLAIMS_FOLDER = 'claims';

/** Estados de la contratación en los que se puede reclamar (los mismos que muestran la acción `reclamar`). */
export const CLAIMABLE_STATES: RequestState[] = ['finalizado', 'completado'];

/** HU-54.2: cada motivo de la API con su nombre en el catálogo claim_reasons. */
export const REASONS = {
  trabajo_no_realizado: 'Trabajo no realizado',
  calidad_deficiente: 'Calidad deficiente',
  cobro_indebido: 'Cobro indebido',
  comportamiento_inadecuado: 'Comportamiento inadecuado',
  transferencia_no_confirmada: 'Transferencia no confirmada',
  otro: 'Otro',
} as const;

export type ClaimReason = keyof typeof REASONS;
export const REASON_KEYS = Object.keys(REASONS) as ClaimReason[];
export const REASON_OF_NAME = Object.fromEntries(Object.entries(REASONS).map(([k, v]) => [v, k])) as Record<string, ClaimReason>;

/** HU-57.3: los estados del catálogo claim_statuses (la API usa los mismos nombres). */
export const CLAIM_STATES = ['abierto', 'en_revision', 'informacion_solicitada', 'resuelto', 'cerrado'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const CLAIM_STATE_LABEL: Record<ClaimState, string> = {
  abierto: 'abierto',
  en_revision: 'en revisión',
  informacion_solicitada: 'información solicitada',
  resuelto: 'resuelto',
  cerrado: 'cerrado',
};

/** Reclamos que siguen activos: los que cuenta el panel y los que impiden abrir otro igual. */
export const ACTIVE_CLAIM_STATES: ClaimState[] = ['abierto', 'en_revision', 'informacion_solicitada'];

/** HU-57: a dónde puede llevar el administrador un reclamo desde cada estado (igual que el front). */
export const CLAIM_TRANSITIONS: Record<ClaimState, ClaimState[]> = {
  abierto: ['en_revision', 'informacion_solicitada', 'resuelto', 'cerrado'],
  en_revision: ['informacion_solicitada', 'resuelto', 'cerrado'],
  informacion_solicitada: ['en_revision', 'resuelto', 'cerrado'],
  resuelto: ['cerrado'],
  cerrado: [],
};
