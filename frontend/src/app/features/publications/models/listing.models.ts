export type ListingState = 'activo' | 'pausado' | 'rechazado' | 'retirado';
export type ListingAction = 'editar' | 'pausar' | 'activar' | 'retirar';

export interface Listing {
  id: string;
  titulo: string;
  oficio: { id: string; nombre: string };
  descripcion: string;
  precioMin: number;
  precioMax: number;
  precioFijo: boolean;
  moneda: 'COP';
  estado: ListingState;
  acciones: ListingAction[];
  fotos: { id: string; url: string }[];
  creada: string;
  actualizada: string;
  contratacionesAbiertas?: number;
}

export interface ListingInput {
  titulo: string;
  oficioId: string;
  descripcion: string;
  precioMin: number;
  precioMax: number;
}

export const MAX_LISTING_PHOTOS = 5;
export const MAX_LISTING_PRICE = 30_000_000;
