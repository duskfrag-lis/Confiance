import { IconName } from '../components/icon/icon';

/**
 * Catálogo de oficios agrupado en dos niveles (HU-11: categoría → oficio).
 * Temporal: cuando exista el backend saldrá de GET /categories.
 * Los ids coinciden con los que usa AuthService.getTrades().
 */
export interface TradeItem {
    id: string;
    name: string;
    icon: IconName;
}

export interface TradeGroup {
    name: string;
    trades: TradeItem[];
}

export const TRADE_GROUPS: TradeGroup[] = [

    {
        name: 'Construcción y obra',
        trades: [
            
            { id: 'albanileria', name: 'Albañilería', icon: 'stack' },
            { id: 'carpinteria', name: 'Carpintería', icon: 'cube' },
            { id: 'pintura', name: 'Pintura', icon: 'pencil' },
            { id: 'enchape-y-pisos', name: 'Enchape y pisos', icon: 'squares' },
            { id: 'impermeabilizacion', name: 'Impermeabilización', icon: 'umbrella' },
            { id: 'soldadura', name: 'Soldadura', icon: 'flame' },
        ],
    },

    {
        name: 'Instalaciones',
        trades: [

            { id: 'fontaneria', name: 'Fontanería', icon: 'drop' },
            { id: 'electricidad', name: 'Electricidad', icon: 'lightning' },
            { id: 'gasodomesticos', name: 'Gasodomésticos', icon: 'flame' },
            { id: 'aire-acondicionado', name: 'Aire acondicionado', icon: 'wind' },
        ],
    },

    {
        name: 'Reparaciones y mantenimiento',
        trades: [

            { id: 'reparaciones-generales', name: 'Reparaciones generales', icon: 'wrench' },
            { id: 'cerrajeria', name: 'Cerrajería', icon: 'key' },
            { id: 'electrodomesticos', name: 'Electrodomésticos', icon: 'monitor' },
            { id: 'vidrieria', name: 'Vidriería', icon: 'window' },
        ],
    },

    {
        name: 'Hogar y limpieza',
        trades: [

            { id: 'aseo', name: 'Aseo', icon: 'sparkle' },
            { id: 'fumigacion', name: 'Fumigación', icon: 'bug' },
            { id: 'jardineria', name: 'Jardinería', icon: 'leaf' },
            { id: 'mudanzas', name: 'Mudanzas', icon: 'truck' },
        ],
    },
];

const ALL_TRADES = TRADE_GROUPS.flatMap((g) => g.trades);

export function tradesById(ids: string[]): TradeItem[] {

    return ids
        .map((id) => ALL_TRADES.find((t) => t.id === id))
        .filter((t): t is TradeItem => !!t);
}
