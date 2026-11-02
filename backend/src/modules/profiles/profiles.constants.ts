/**
 * HU-17: días y bloques por su nombre. La API usa los nombres en español y la base los del catálogo
 * (migración seed_catalogs). Usar nombres evita el desfase de JS (0 = domingo) con la base (1 = lunes).
 */
export const DAYS = {
  lunes: 'monday',
  martes: 'tuesday',
  miercoles: 'wednesday',
  jueves: 'thursday',
  viernes: 'friday',
  sabado: 'saturday',
  domingo: 'sunday',
} as const;

export const BLOCKS = {
  manana: 'morning',
  tarde: 'afternoon',
  noche: 'evening',
} as const;

export type DayKey = keyof typeof DAYS;
export type BlockKey = keyof typeof BLOCKS;

export const DAY_KEYS = Object.keys(DAYS) as DayKey[];
export const BLOCK_KEYS = Object.keys(BLOCKS) as BlockKey[];

export const dayKeyOf = (dbName: string) => DAY_KEYS.find((k) => DAYS[k] === dbName)!;
export const blockKeyOf = (dbName: string) => BLOCK_KEYS.find((k) => BLOCKS[k] === dbName)!;

/** HU-13.3: secciones del perfil profesional que el panel marca como pendientes. */
export type ProviderSection = 'foto' | 'descripcion' | 'oficios' | 'zonas' | 'disponibilidad' | 'evidencias';

/** HU-18: tipos de cuenta (catálogo bank_account_types). */
export const ACCOUNT_TYPES = { ahorros: 'savings', corriente: 'checking' } as const;
export type AccountTypeKey = keyof typeof ACCOUNT_TYPES;
export const ACCOUNT_TYPE_KEYS = Object.keys(ACCOUNT_TYPES) as AccountTypeKey[];
export const accountTypeKeyOf = (dbName: string) => ACCOUNT_TYPE_KEYS.find((k) => ACCOUNT_TYPES[k] === dbName)!;

/** HU-18.2: el cliente ve los datos bancarios solo en estos estados; D-58: en ellos el prestador no puede cambiarlos. */
export const BANK_VISIBLE_STATES = ['aceptado', 'confirmado', 'en_curso', 'finalizado'];

/** HU-19 (D-42): una evidencia se publica al cargarla, sin revisión; retirada se conserva. */
export const EvidenceStatus = { PUBLISHED: 'published', WITHDRAWN: 'withdrawn' } as const;
export const MAX_EVIDENCE_PHOTOS = 5;
