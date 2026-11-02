export interface ListingCard {
  id: string;
  titulo: string;
  descripcion: string;
  oficio: { id: string; nombre: string };
  precioMin: number;
  precioMax: number;
  precioFijo: boolean;
  moneda: 'COP';
  foto: string | null;
  prestador: {
    id: string;
    nombre: string;
    fotoUrl: string | null;
    calificacion: { promedio: number; cantidad: number };
    verificado: boolean;
  };
}

export interface SearchQuery {
  q?: string;
  categoriaId?: string;
  comunaId?: string;
  barrioId?: string;
  precioMin?: number;
  precioMax?: number;
  calificacionMin?: number;
  fecha?: string;
  soloVerificados?: boolean;
  pagina?: number;
}

export interface SearchPage {
  total: number;
  pagina: number;
  tamano: number;
  resultados: ListingCard[];
  sugerencia?: 'publicar_necesidad' | null;
}
