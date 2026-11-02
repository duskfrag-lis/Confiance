import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../publications/catalog.service';
import { CATALOG_PAGE_SIZE } from '../publications/publications.constants';
import type { SearchQuery } from './dto/search.dto';

/** Máximo de palabras del texto que se tienen en cuenta. */
const MAX_WORDS = 5;

// Letras con tilde (y la ñ) que se igualan a su letra base, igual que normalizeText en JS
const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuunc';

/** Minúsculas y sin tildes, como `unaccent(lower(x))` pero sin depender de la extensión. */
export const normalizeText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const norm = (column: Prisma.Sql) => Prisma.sql`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`;

/** Fecha de hoy en Colombia, AAAA-MM-DD. */
const todayInBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/**
 * HU-31 a HU-33 · Búsqueda de servicios, sin sesión. Arma la consulta en SQL (texto sin tildes, relevancia,
 * disponibilidad) y después pide las tarjetas al catálogo, así los resultados se ven igual que en HU-27.
 */
@Injectable()
export class SearchService {

  constructor(
    private prisma: PrismaService,
    private catalog: CatalogService,
  ) {}

  async search(query: SearchQuery) {

    if (query.precioMin !== undefined && query.precioMax !== undefined && query.precioMax < query.precioMin) {

      throw apiError(HttpStatus.BAD_REQUEST, 'PRICE_RANGE', 'El precio máximo debe ser mayor o igual que el mínimo.');
    }

    if (query.fecha && query.fecha < todayInBogota()) {

      throw apiError(HttpStatus.BAD_REQUEST, 'PAST_DATE', 'Elige una fecha de hoy en adelante.');
    }

    const page = query.pagina ?? 1;
    const size = query.tamano ?? CATALOG_PAGE_SIZE;
    const words = normalizeText(query.q ?? '').split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);

    const where = Prisma.join(this.conditions(query, words), ' AND ');
    // HU-32.2: relevancia = palabras que aparecen en el título; a igual coincidencia, la mayor calificación. Sin
    // texto no hay coincidencias que contar (un `ORDER BY 0` además se leería como posición de columna)
    const titleHits = words.map((w) => Prisma.sql`(strpos(${norm(Prisma.sql`sl.title`)}, ${w}) > 0)::int`);
    const orderBy = Prisma.join([
      ...(titleHits.length ? [Prisma.sql`${Prisma.join(titleHits, ' + ')} DESC`] : []),
      Prisma.sql`vp.avg_rating DESC, sl.created_at DESC, sl.service_listing_id DESC`,
    ]);

    const from = Prisma.sql`
      FROM service_listings sl
      JOIN listing_statuses ls ON ls.listing_status_id = sl.status_id
      JOIN categories c ON c.category_id = sl.category_id
      -- La vista excluye las cuentas deshabilitadas y calcula la calificación y la insignia al consultar
      JOIN v_provider_public_profile vp ON vp.provider_profile_id = sl.provider_profile_id
      WHERE ${where}`;

    const [[{ total }], rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${from}`,
      this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT sl.service_listing_id AS id ${from}
        ORDER BY ${orderBy}
        LIMIT ${size} OFFSET ${(page - 1) * size}`,
    ]);

    return {
      total: Number(total),
      pagina: page,
      tamano: size,
      resultados: await this.catalog.cards(rows.map((r) => r.id)),
      // HU-32.3: sin resultados, el front sugiere publicar una necesidad (HU-26)
      sugerencia: Number(total) === 0 ? ('publicar_necesidad' as const) : null,
    };
  }

  private conditions(query: SearchQuery, words: string[]): Prisma.Sql[] {

    const conditions: Prisma.Sql[] = [
      Prisma.sql`ls.status_name = 'active'`,
      // Como en el catálogo: un oficio o una categoría desactivados dejan de ofrecerse
      Prisma.sql`c.is_active AND EXISTS (SELECT 1 FROM categories p WHERE p.category_id = c.parent_category_id AND p.is_active)`,
    ];

    // HU-31.1: cada palabra debe aparecer en el título, la descripción o el oficio
    for (const w of words) {

      conditions.push(Prisma.sql`(
        strpos(${norm(Prisma.sql`sl.title`)}, ${w}) > 0
        OR strpos(${norm(Prisma.sql`sl.description`)}, ${w}) > 0
        OR strpos(${norm(Prisma.sql`c.category_name`)}, ${w}) > 0)`);
    }

    // HU-31.2 y D-55: una categoría incluye todos sus oficios
    if (query.categoriaId) {

      const id = Number(query.categoriaId);
      conditions.push(Prisma.sql`(sl.category_id = ${id} OR c.parent_category_id = ${id})`);
    }

    // HU-33: zona de atención del prestador (barrio o cualquier barrio de la comuna)
    if (query.barrioId || query.comunaId) {

      const zone = query.barrioId
        ? Prisma.sql`n.neighborhood_id = ${Number(query.barrioId)}`
        : Prisma.sql`n.commune_id = ${Number(query.comunaId)}`;

      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM provider_service_areas psa
        JOIN neighborhoods n ON n.neighborhood_id = psa.neighborhood_id
        WHERE psa.provider_profile_id = sl.provider_profile_id AND ${zone})`);
    }

    // HU-33: rango de precio; sale la publicación cuyo rango se cruza con el pedido
    if (query.precioMin !== undefined) conditions.push(Prisma.sql`sl.max_price >= ${query.precioMin}`);
    if (query.precioMax !== undefined) conditions.push(Prisma.sql`sl.min_price <= ${query.precioMax}`);

    if (query.calificacionMin !== undefined) conditions.push(Prisma.sql`vp.avg_rating >= ${query.calificacionMin}`);

    if (query.soloVerificados) conditions.push(Prisma.sql`vp.identity_verified`);

    // HU-33.3: al menos un bloque configurado ese día de la semana que no esté ocupado (ACEPTADO a EN_CURSO,
    // la misma regla con la que la base bloquea el horario al aceptar)
    if (query.fecha) {

      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM provider_availability pa
        JOIN time_blocks tb ON tb.time_block_id = pa.time_block_id
        WHERE pa.provider_profile_id = sl.provider_profile_id
          AND pa.day_of_week_id = EXTRACT(ISODOW FROM ${query.fecha}::date)
          AND NOT fn_provider_slot_taken(
            sl.provider_profile_id, (${query.fecha}::date + tb.start_time) AT TIME ZONE 'America/Bogota', NULL))`);
    }

    return conditions;
  }
}
