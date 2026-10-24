import { IconName } from '../../../shared/components/icon/icon';

export type ClaimState = 'abierto' | 'en_revision' | 'informacion_solicitada' | 'resuelto' | 'cerrado';

export type ClaimReason =
  | 'trabajo_no_realizado'
  | 'calidad_deficiente'
  | 'cobro_indebido'
  | 'comportamiento_inadecuado'
  | 'transferencia_no_confirmada'
  | 'otro';

export interface ClaimStep {
  estado: ClaimState;
  fecha: string;
  nota: string | null;
}

export interface ClaimApi {
  id: string;
  contratacionId: string;
  servicio: string;
  motivo: ClaimReason;
  descripcion: string;
  estado: ClaimState;
  creado: string;
  mio: boolean;
  contraparte: { nombre: string; fotoUrl: string | null };
  fotos: string[];
  historial: ClaimStep[];
  resolucion: { texto: string; fecha: string } | null;
}

export const MAX_DESCRIPTION = 1000;
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ['image/jpeg', 'image/png'];

export const REASONS: { id: ClaimReason; label: string; hint: string; icon: IconName }[] = [
  { id: 'trabajo_no_realizado', label: 'Trabajo no realizado', hint: 'No se hizo o quedó incompleto', icon: 'x-circle' },
  { id: 'calidad_deficiente', label: 'Calidad deficiente', hint: 'El resultado no fue el acordado', icon: 'wrench' },
  { id: 'cobro_indebido', label: 'Cobro indebido', hint: 'Cobro distinto al acordado', icon: 'money' },
  { id: 'comportamiento_inadecuado', label: 'Comportamiento inadecuado', hint: 'Trato irrespetuoso o inseguro', icon: 'user' },
  { id: 'transferencia_no_confirmada', label: 'Transferencia no confirmada', hint: 'Pagaste y no la confirmaron', icon: 'credit-card' },
  { id: 'otro', label: 'Otro', hint: 'Otro problema con el servicio', icon: 'info' },
];

export const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.id, r.label])) as Record<ClaimReason, string>;

export const STATE_LABEL: Record<ClaimState, string> = {
  abierto: 'Abierto',
  en_revision: 'En revisión',
  informacion_solicitada: 'Información solicitada',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

export const isClosed = (state: ClaimState): boolean => state === 'resuelto' || state === 'cerrado';

export const isActive = (c: ClaimApi): boolean => !isClosed(c.estado);

/** Cambios de estado que puede hacer el administrador (HU-57). */
export const CLAIM_TRANSITIONS: Record<ClaimState, ClaimState[]> = {
  abierto: ['en_revision', 'informacion_solicitada', 'resuelto', 'cerrado'],
  en_revision: ['informacion_solicitada', 'resuelto', 'cerrado'],
  informacion_solicitada: ['en_revision', 'resuelto', 'cerrado'],
  resuelto: ['cerrado'],
  cerrado: [],
};
