import { BlockKey, DayKey } from '../../profiles/models/profiles.models';

// Las claves y los valores vienen tal cual de la API (docs/publications.md)
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
  // Aún no los devuelve la API: la vista los muestra solo si llegan.
  interesados?: number;
  solicitudId?: string | null;
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

export const MAX_NEED_PHOTOS = 5;
