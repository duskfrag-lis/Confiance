export interface Commune {
  id: string;
  nombre: string;
  barrios: { id: string; nombre: string }[];
}

export interface ClientProfile {
  nombres: string;
  apellidos: string;
  celular: string;
  correo: string;
  cedula: string;
  fotoUrl: string | null;
  zona: { barrioId: string; barrio: string; comunaId: string; comuna: string } | null;
  direccion: string | null;
  descripcion: string | null;
  miembroDesde?: string;
  calificacion?: { promedio: number | null; cantidad: number };
  actividad?: { necesidades: number; contrataciones: number; resenas: number };
}

export interface ClientProfileUpdate {
  nombres: string;
  apellidos: string;
  celular: string;
  barrioId: string | null;
  direccion: string | null;
  descripcion: string | null;
}

export type DayKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type BlockKey = 'manana' | 'tarde' | 'noche';
export type ProviderSection = 'foto' | 'descripcion' | 'oficios' | 'zonas' | 'disponibilidad' | 'evidencias';

export interface AvailabilityCatalog {
  dias: { id: DayKey; nombre: string }[];
  bloques: { id: BlockKey; nombre: string; inicio: string; fin: string }[];
}

export interface ProviderZone {
  comunaId: string;
  comuna: string;
  completa: boolean;
  barrios: { id: string; nombre: string }[];
}

export interface ProviderProfile {
  fotoUrl: string | null;
  descripcion: string | null;
  oficios: { id: string; nombre: string; categoria: string | null }[];
  zonas: ProviderZone[];
  disponibilidad: { dia: DayKey; bloque: BlockKey }[];
  evidencias: number;
  completo: boolean;
  faltantes: ProviderSection[];
  calificacion?: { promedio: number | null; cantidad: number };
  serviciosCompletados?: number;
  verificacion?: 'pendiente' | 'aprobada' | 'rechazada' | 'correccion' | null;
}

export interface BankAccount {
  banco: string;
  tipoCuenta: 'ahorros' | 'corriente';
  numero: string;
  editable: boolean;
}

export interface Evidence {
  id: string;
  descripcion: string;
  fecha: string;
  fotos: string[];
  retirada?: boolean;
}

export interface PublicProviderProfile {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  descripcion: string | null;
  oficios: { id: string; nombre: string }[];
  zonas: { comuna: string; completa: boolean; barrios: string[] }[];
  disponibilidad: { dia: DayKey; bloque: BlockKey }[];
  calificacion: { promedio: number; cantidad: number };
  serviciosCompletados: number;
  verificado: boolean;
  publicaciones: { id: string; titulo: string; precioMin: number; precioMax: number }[];
  evidencias: Evidence[];
  resenas?: { autor: string; puntaje: number; comentario: string | null; fecha: string }[];
}
