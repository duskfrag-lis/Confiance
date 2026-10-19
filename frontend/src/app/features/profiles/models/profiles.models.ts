/** GET /api/catalogs/zones (HU-11, HU-16). */
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
