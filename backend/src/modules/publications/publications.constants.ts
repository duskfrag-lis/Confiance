/** HU-21 a HU-25: estados de una publicación (catálogo listing_statuses). La API usa los nombres en español. */
export const LISTING_STATES = {
  activo: 'active',
  pausado: 'paused',
  // Reservado para la moderación de la E17 (HU-25, regla de implementación)
  rechazado: 'rejected',
  retirado: 'withdrawn',
} as const;

export type ListingStateKey = keyof typeof LISTING_STATES;
export const LISTING_STATE_KEYS = Object.keys(LISTING_STATES) as ListingStateKey[];
export const listingStateKeyOf = (dbName: string) => LISTING_STATE_KEYS.find((k) => LISTING_STATES[k] === dbName)!;

/** HU-25.3: acciones que el listado ofrece en cada estado. Retirar puede fallar si hay contrataciones abiertas (HU-24.1). */
export const LISTING_ACTIONS: Record<ListingStateKey, ('editar' | 'pausar' | 'activar' | 'retirar')[]> = {
  activo: ['editar', 'pausar', 'retirar'],
  pausado: ['editar', 'activar', 'retirar'],
  rechazado: ['retirar'],
  retirado: [],
};

/** HU-24.1: una publicación se retira solo si todas sus contrataciones están en uno de estos estados. */
export const CLOSED_REQUEST_STATES = ['completado', 'cancelado', 'rechazado'];

/** HU-21 (D-54): de 1 a 5 fotos por publicación. */
export const MAX_LISTING_PHOTOS = 5;

/** Precios en pesos enteros (HU-21.3), de 0 a 30 millones (decidido el 2026-10-19). */
export const MAX_PRICE = 30_000_000;

/** HU-27: tamaño de página del catálogo. */
export const CATALOG_PAGE_SIZE = 20;
export const CATALOG_MAX_PAGE_SIZE = 50;
