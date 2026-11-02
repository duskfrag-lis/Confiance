import { IconName } from '../components/icon/icon';

export interface CategoryInfo {
  name: string;
  icon: IconName;
}

export interface TradeInfo {
  name: string;
  category: string;
  icon: IconName;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { name: 'Construcción y obra', icon: 'buildings' },
  { name: 'Instalaciones', icon: 'plug' },
  { name: 'Reparaciones y mantenimiento', icon: 'toolbox' },
  { name: 'Hogar y limpieza', icon: 'sparkle' },
  { name: 'Cuidado personal y mascotas', icon: 'heart' },
  { name: 'Eventos', icon: 'confetti' },
];

const t = (category: string, name: string, icon: IconName, description: string): TradeInfo => ({ name, category, icon, description });

export const TRADES: TradeInfo[] = [
  t('Construcción y obra', 'Albañilería', 'wall', 'Muros, pisos y obra en general'),
  t('Construcción y obra', 'Carpintería', 'hammer', 'Puertas, muebles y estructuras en madera'),
  t('Construcción y obra', 'Pintura', 'paint-roller', 'Interiores, fachadas y acabados'),
  t('Construcción y obra', 'Enchape y pisos', 'grid-four', 'Cerámica, porcelanato y pisos'),
  t('Construcción y obra', 'Impermeabilización', 'umbrella-simple', 'Techos, terrazas y humedades'),
  t('Construcción y obra', 'Soldadura', 'fire-simple', 'Rejas, puertas y estructuras metálicas'),
  t('Construcción y obra', 'Drywall y cielorrasos', 'square-split', 'Divisiones y techos falsos'),
  t('Construcción y obra', 'Estuco y acabados', 'paint-brush-broad', 'Estuco, resanes y acabados finos'),
  t('Construcción y obra', 'Techos y cubiertas', 'house-line', 'Tejas, canoas y goteras'),
  t('Construcción y obra', 'Remodelaciones', 'blueprint', 'Cocinas, baños y espacios completos'),
  t('Construcción y obra', 'Ebanistería', 'armchair', 'Muebles finos a medida'),

  t('Instalaciones', 'Fontanería', 'pipe-wrench', 'Fugas, grifería y tuberías'),
  t('Instalaciones', 'Electricidad', 'lightning', 'Instalaciones, tomas y cableado'),
  t('Instalaciones', 'Gasodomésticos', 'flame', 'Estufas, hornos y redes de gas'),
  t('Instalaciones', 'Aire acondicionado', 'snowflake', 'Instalación y mantenimiento'),
  t('Instalaciones', 'Calentadores', 'thermometer-hot', 'Calentadores a gas y eléctricos'),
  t('Instalaciones', 'Redes e internet', 'wifi', 'Wifi, cableado y puntos de red'),
  t('Instalaciones', 'Cámaras de seguridad', 'security-camera', 'Cámaras, DVR y monitoreo'),
  t('Instalaciones', 'Antenas y televisión', 'television', 'Televisores, soportes y antenas'),
  t('Instalaciones', 'Paneles solares', 'solar-panel', 'Energía solar para el hogar'),
  t('Instalaciones', 'Cortinas y persianas', 'rows', 'Instalación de cortinas y persianas'),

  t('Reparaciones y mantenimiento', 'Reparaciones generales', 'wrench', 'Arreglos del hogar'),
  t('Reparaciones y mantenimiento', 'Cerrajería', 'key', 'Cerraduras, llaves y aperturas'),
  t('Reparaciones y mantenimiento', 'Electrodomésticos', 'washing-machine', 'Lavadoras, neveras y estufas'),
  t('Reparaciones y mantenimiento', 'Vidriería', 'app-window', 'Vidrios, ventanas y espejos'),
  t('Reparaciones y mantenimiento', 'Reparación de computadores', 'laptop', 'Mantenimiento y formateo'),
  t('Reparaciones y mantenimiento', 'Reparación de celulares', 'device-mobile', 'Pantallas, baterías y software'),
  t('Reparaciones y mantenimiento', 'Tapicería', 'couch', 'Sofás, sillas y espaldares'),
  t('Reparaciones y mantenimiento', 'Mantenimiento de motos', 'motorcycle', 'Revisión y arreglos a domicilio'),
  t('Reparaciones y mantenimiento', 'Mantenimiento de bicicletas', 'bicycle', 'Ajustes, frenos y cambios'),

  t('Hogar y limpieza', 'Aseo', 'broom', 'Limpieza de casas y locales'),
  t('Hogar y limpieza', 'Fumigación', 'bug', 'Control de plagas'),
  t('Hogar y limpieza', 'Jardinería', 'plant', 'Poda, jardines y zonas verdes'),
  t('Hogar y limpieza', 'Mudanzas', 'truck', 'Trasteos y acarreos'),
  t('Hogar y limpieza', 'Lavado de muebles y colchones', 'bed', 'Sofás, colchones y alfombras'),
  t('Hogar y limpieza', 'Limpieza de vidrios y fachadas', 'spray-bottle', 'Ventanales y fachadas'),
  t('Hogar y limpieza', 'Lavandería y planchado', 't-shirt', 'Lavado y planchado de ropa'),
  t('Hogar y limpieza', 'Mantenimiento de piscinas', 'swimming-pool', 'Limpieza y químicos'),
  t('Hogar y limpieza', 'Lavado de tanques', 'cylinder', 'Tanques y reservas de agua'),
  t('Hogar y limpieza', 'Cocina a domicilio', 'chef-hat', 'Comidas y eventos en casa'),

  t('Cuidado personal y mascotas', 'Cuidado de adultos mayores', 'hand-heart', 'Acompañamiento y cuidados'),
  t('Cuidado personal y mascotas', 'Niñera', 'baby', 'Cuidado de niños por horas'),
  t('Cuidado personal y mascotas', 'Peluquería a domicilio', 'scissors', 'Cortes, cepillados y peinados'),
  t('Cuidado personal y mascotas', 'Manicure y pedicure', 'hand-palm', 'Uñas en la comodidad de tu casa'),
  t('Cuidado personal y mascotas', 'Paseo de perros', 'dog', 'Paseos diarios o por horas'),
  t('Cuidado personal y mascotas', 'Peluquería canina', 'paw-print', 'Baño y corte para mascotas'),

  t('Eventos', 'Decoración de eventos', 'balloon', 'Cumpleaños, baby showers y más'),
  t('Eventos', 'Meseros y logística', 'fork-knife', 'Atención y montaje de eventos'),
  t('Eventos', 'Fotografía', 'camera', 'Fotos de eventos y familia'),
  t('Eventos', 'Sonido e iluminación', 'speaker', 'Equipos para fiestas y reuniones'),
];

export const POPULAR_TRADES = [
  'Fontanería',
  'Electricidad',
  'Aseo',
  'Pintura',
  'Cerrajería',
  'Carpintería',
  'Aire acondicionado',
  'Cuidado de adultos mayores',
];

export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const slugify = (s: string): string => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const FALLBACK_TRADE = { icon: 'wrench' as IconName, description: '' };
const FALLBACK_CATEGORY = { icon: 'squares' as IconName };

export const tradeInfo = (name: string) => TRADES.find((x) => normalize(x.name) === normalize(name)) ?? FALLBACK_TRADE;
export const categoryInfo = (name: string) => CATEGORIES.find((x) => normalize(x.name) === normalize(name)) ?? FALLBACK_CATEGORY;

export const tradeById = (slug: string | null) => TRADES.find((x) => slugify(x.name) === slug);

export interface TradeView {
  id: string;
  name: string;
  icon: IconName;
  description: string;
}

export interface TradeGroupView {
  id: string;
  name: string;
  icon: IconName;
  trades: TradeView[];
}

const order = (list: { name: string }[], name: string) => {
  const i = list.findIndex((x) => normalize(x.name) === normalize(name));
  return i < 0 ? list.length : i;
};

export function groupTrades(trades: { id: string; name: string; group: string; groupId: string }[]): TradeGroupView[] {
  const groups = new Map<string, TradeGroupView>();
  for (const x of trades) {
    const cat = categoryInfo(x.group);
    const g = groups.get(x.groupId) ?? { id: x.groupId, name: x.group, icon: cat.icon, trades: [] };
    const info = tradeInfo(x.name);
    g.trades.push({ id: x.id, name: x.name, icon: info.icon, description: info.description });
    groups.set(x.groupId, g);
  }
  return [...groups.values()]
    .sort((a, b) => order(CATEGORIES, a.name) - order(CATEGORIES, b.name))
    .map((g) => ({ ...g, trades: g.trades.sort((a, b) => order(TRADES, a.name) - order(TRADES, b.name)) }));
}
