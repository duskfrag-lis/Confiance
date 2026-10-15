/**
 * Catálogo de zonas en dos niveles (HU-13: comuna → barrio).
 * Temporal y de ejemplo: cuando exista el backend saldrá del catálogo administrado.
 */
export interface Commune {
  id: string;
  name: string;
  neighborhoods: string[];
}

export const COMMUNES: Commune[] = [
  {
    id: 'comuna-10',
    name: 'Comuna 10, La Candelaria',
    neighborhoods: ['Prado', 'Boston', 'San Benito', 'Jesús Nazareno', 'Bomboná'],
  },
  {
    id: 'comuna-11',
    name: 'Comuna 11, Laureles-Estadio',
    neighborhoods: ['Laureles', 'Estadio', 'Lorena', 'San Joaquín', 'La Castellana', 'Los Conquistadores'],
  },
  {
    id: 'comuna-12',
    name: 'Comuna 12, La América',
    neighborhoods: ['La América', 'Santa Lucía', 'Simón Bolívar', 'Calasanz', 'Los Pinos'],
  },
  {
    id: 'comuna-14',
    name: 'Comuna 14, El Poblado',
    neighborhoods: ['El Poblado', 'Manila', 'Astorga', 'Patio Bonito', 'Lalinde'],
  },
  {
    id: 'comuna-16',
    name: 'Comuna 16, Belén',
    neighborhoods: ['Belén', 'Fátima', 'Rosales', 'La Mota', 'Los Alpes'],
  },
];

export function communeById(id: string | null): Commune | undefined {
  return COMMUNES.find((c) => c.id === id);
}
