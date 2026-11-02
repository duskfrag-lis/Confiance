import { BlockKey, DayKey } from '../../profiles/models/profiles.models';

export type NeedState = 'abierta' | 'prestador_seleccionado' | 'cerrada';
export type InterestState = 'pendiente' | 'seleccionado' | 'no_seleccionado';

export interface Need {
  id: string;
  titulo: string;
  descripcion: string;
  oficio: { id: string; nombre: string };
  zona: { barrioId: string; barrio: string; comunaId: string; comuna: string };
  fechaPreferida: string;
  presupuestoMin: number;
  presupuestoMax: number;
  moneda: 'COP';
  fotos: string[];
  publicada: string;
  direccion: string;
  estado: NeedState;
  vencida: boolean;
  acciones: 'cerrar'[];
  interesados?: number;
  solicitudId?: string | null;
}

export type BoardNeed = Omit<Need, 'direccion' | 'estado' | 'vencida' | 'acciones' | 'solicitudId'> & { deTuOficio?: boolean };

export interface Page<T> {
  total: number;
  pagina: number;
  tamano: number;
  resultados: T[];
}

export interface NeedsBoardQuery {
  categoriaId?: string;
  comunaId?: string;
  barrioId?: string;
  pagina?: number;
}

export interface MyInterest {
  id: string;
  necesidad: { id: string; titulo: string; fechaPreferida?: string };
  mensaje: string | null;
  precioPropuesto: number | null;
  estado: InterestState;
  solicitudId?: string | null;
  creado: string;
}

export interface NeedInput {
  titulo: string;
  descripcion: string;
  oficioId: string;
  barrioId: string;
  direccion: string;
  fechaPreferida: string;
  presupuestoMin: number;
  presupuestoMax: number;
}

export interface NeedInterest {
  id: string;
  prestador: {
    id: string;
    nombre: string;
    fotoUrl: string | null;
    calificacion: { promedio: number; cantidad: number };
    verificado: boolean;
    serviciosCompletados: number;
    disponibilidad: { dia: DayKey; bloque: BlockKey }[];
  };
  mensaje: string | null;
  precioPropuesto: number | null;
  estado: InterestState;
  creado: string;
}

export interface SelectionResult {
  solicitudId: string;
  estado: 'solicitado';
  valor: number;
  fecha: string;
}

export const NEED_STATE_LABEL: Record<NeedState, string> = {
  abierta: 'Abierta',
  prestador_seleccionado: 'Prestador seleccionado',
  cerrada: 'Cerrada',
};

export const INTEREST_STATE_LABEL: Record<InterestState, string> = {
  pendiente: 'Pendiente',
  seleccionado: 'Seleccionado',
  no_seleccionado: 'No seleccionado',
};

export const MAX_NEED_PHOTOS = 5;
export const MAX_INTEREST_MESSAGE = 500;
