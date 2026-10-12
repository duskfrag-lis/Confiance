import { IconName } from '../components/icon/icon';

export interface TradeItem {
  id: string;
  name: string;
  description: string;
  icon: IconName;
}

export interface TradeGroup {
  id: string;
  name: string;
  trades: TradeItem[];
}

export const TRADE_GROUPS: TradeGroup[] = [
  {
    id: 'construccion',
    name: 'Construcción y obra',
    trades: [
      { id: 'albanileria', name: 'Albañilería', description: 'Muros, pisos y obra en general', icon: 'stack' },
      { id: 'carpinteria', name: 'Carpintería', description: 'Muebles, puertas y acabados en madera', icon: 'cube' },
      { id: 'pintura', name: 'Pintura', description: 'Interiores, fachadas y acabados', icon: 'pencil' },
      { id: 'enchape-y-pisos', name: 'Enchape y pisos', description: 'Cerámica, porcelanato y pisos', icon: 'squares' },
      { id: 'impermeabilizacion', name: 'Impermeabilización', description: 'Techos, terrazas y humedades', icon: 'umbrella' },
      { id: 'soldadura', name: 'Soldadura', description: 'Rejas, puertas y estructuras metálicas', icon: 'flame' },
    ],
  },
  {
    id: 'instalaciones',
    name: 'Instalaciones',
    trades: [
      { id: 'fontaneria', name: 'Fontanería', description: 'Fugas, grifería y tuberías', icon: 'drop' },
      { id: 'electricidad', name: 'Electricidad', description: 'Instalaciones, tomas y cableado', icon: 'lightning' },
      { id: 'gasodomesticos', name: 'Gasodomésticos', description: 'Instalación y revisión de gas', icon: 'flame' },
      { id: 'aire-acondicionado', name: 'Aire acondicionado', description: 'Instalación y mantenimiento', icon: 'wind' },
    ],
  },
  {
    id: 'reparaciones',
    name: 'Reparaciones y mantenimiento',
    trades: [
      { id: 'reparaciones-generales', name: 'Reparaciones generales', description: 'Arreglos del hogar', icon: 'wrench' },
      { id: 'cerrajeria', name: 'Cerrajería', description: 'Cerraduras, llaves y aperturas', icon: 'key' },
      { id: 'electrodomesticos', name: 'Electrodomésticos', description: 'Reparación y mantenimiento', icon: 'monitor' },
      { id: 'vidrieria', name: 'Vidriería', description: 'Vidrios, ventanas y espejos', icon: 'window' },
    ],
  },
  {
    id: 'hogar',
    name: 'Hogar y limpieza',
    trades: [
      { id: 'aseo', name: 'Aseo', description: 'Limpieza de casas y locales', icon: 'sparkle' },
      { id: 'fumigacion', name: 'Fumigación', description: 'Control de plagas', icon: 'bug' },
      { id: 'jardineria', name: 'Jardinería', description: 'Poda, jardines y zonas verdes', icon: 'leaf' },
      { id: 'mudanzas', name: 'Mudanzas', description: 'Traslados y cargue', icon: 'truck' },
    ],
  },
];

export const ALL_TRADES: TradeItem[] = TRADE_GROUPS.flatMap((g) => g.trades);

export function tradesById(ids: string[]): TradeItem[] {
  return ids
    .map((id) => ALL_TRADES.find((t) => t.id === id))
    .filter((t): t is TradeItem => !!t);
}

export function tradeById(id: string | null): TradeItem | undefined {
  return ALL_TRADES.find((t) => t.id === id);
}
