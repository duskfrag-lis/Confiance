import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import type { CatalogQuery } from './dto/publications.dto';
import { CATALOG_PAGE_SIZE, LISTING_STATES } from './publications.constants';

interface ProviderSummary {
  provider_profile_id: bigint;
  avg_rating: string;
  rating_count: bigint;
  identity_verified: boolean;
}

const SELECT = {
  service_listing_id: true,
  title: true,
  description: true,
  min_price: true,
  max_price: true,
  provider_profile_id: true,
  categories: { select: { category_id: true, category_name: true } },
  service_listing_photos: { select: { photo_url: true }, orderBy: { service_listing_photo_id: 'asc' } },
  provider_profiles: { select: { users: { select: { first_name: true, last_name: true, profile_photo_url: true } } } },
} satisfies Prisma.service_listingsSelect;

type CatalogRow = Prisma.service_listingsGetPayload<{ select: typeof SELECT }>;

/**
 * HU-27 · Catálogo general de servicios, sin sesión. Solo publicaciones activas de cuentas no deshabilitadas
 * (HU-27.1). Nunca expone datos de contacto del prestador: se arma campo por campo, como el perfil público.
 */
@Injectable()
export class CatalogService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async list(query: CatalogQuery) {

    const page = query.pagina ?? 1;
    const size = query.tamano ?? CATALOG_PAGE_SIZE;
    const categoryId = query.categoriaId ? Number(query.categoriaId) : undefined;

    const where: Prisma.service_listingsWhereInput = {
      ...this.visible(),
      // HU-27.4 y D-55: una categoría incluye todos sus oficios; también se puede pedir un oficio
      ...(categoryId !== undefined && {
        OR: [{ category_id: categoryId }, { categories: { parent_category_id: categoryId } }],
      }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.service_listings.count({ where }),
      this.prisma.service_listings.findMany({
        where,
        select: SELECT,
        orderBy: [{ created_at: 'desc' }, { service_listing_id: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    const summaries = await this.summaries(rows.map((r) => r.provider_profile_id));

    return { total, pagina: page, tamano: size, resultados: rows.map((r) => this.toCard(r, summaries)) };
  }

  /**
   * Tarjetas del catálogo para estos ids, en el mismo orden (HU-32: la búsqueda ordena por relevancia). Solo las
   * que siguen visibles: si una se pausó entre la búsqueda y esta consulta, no sale.
   */
  async cards(listingIds: bigint[]) {

    if (!listingIds.length) return [];

    const rows = await this.prisma.service_listings.findMany({
      where: { service_listing_id: { in: listingIds }, ...this.visible() },
      select: SELECT,
    });

    const summaries = await this.summaries(rows.map((r) => r.provider_profile_id));
    const byId = new Map(rows.map((r) => [r.service_listing_id, r]));

    return listingIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [this.toCard(row, summaries)] : [];
    });
  }

  /** Detalle público de una publicación, con todas sus fotos. */
  async get(listingId: bigint) {

    const row = await this.prisma.service_listings.findFirst({
      where: { service_listing_id: listingId, ...this.visible() },
      select: SELECT,
    });

    if (!row) throw new NotFoundException('La publicación no existe o ya no está disponible.');

    return this.format(row, await this.summaries([row.provider_profile_id]));
  }

  private visible(): Prisma.service_listingsWhereInput {

    return {
      listing_statuses: { status_name: LISTING_STATES.activo },
      provider_profiles: { users: { account_statuses: { status_name: { not: 'disabled' } } } },
      // Si el oficio o su categoría se desactivan, la publicación deja de ofrecerse (el dueño la sigue viendo)
      categories: { is_active: true, categories: { is_active: true } },
    };
  }

  /** Calificación e insignia, calculadas al consultar por la misma vista del perfil público (HU-20). */
  private async summaries(providerIds: bigint[]) {

    const ids = [...new Set(providerIds)];

    if (!ids.length) return new Map<bigint, ProviderSummary>();

    const rows = await this.prisma.$queryRaw<ProviderSummary[]>`
      SELECT provider_profile_id, avg_rating, rating_count, identity_verified
      FROM v_provider_public_profile
      WHERE provider_profile_id IN (${Prisma.join(ids)})`;

    return new Map(rows.map((r) => [r.provider_profile_id, r]));
  }

  /** La tarjeta del listado lleva solo la primera foto. */
  private toCard(r: CatalogRow, summaries: Map<bigint, ProviderSummary>) {

    const { fotos, ...card } = this.format(r, summaries);
    return { ...card, foto: fotos[0] ?? null };
  }

  private format(r: CatalogRow, summaries: Map<bigint, ProviderSummary>) {

    const summary = summaries.get(r.provider_profile_id);
    const user = r.provider_profiles.users;

    return {
      id: String(r.service_listing_id),
      titulo: r.title,
      descripcion: r.description,
      oficio: { id: String(r.categories.category_id), nombre: r.categories.category_name },
      precioMin: Number(r.min_price),
      precioMax: Number(r.max_price),
      precioFijo: Number(r.min_price) === Number(r.max_price),
      moneda: 'COP',
      fotos: r.service_listing_photos.map((p) => this.storage.publicUrl(p.photo_url)).filter((url) => url !== null),
      prestador: {
        id: String(r.provider_profile_id),
        nombre: `${user.first_name} ${user.last_name}`,
        fotoUrl: this.storage.publicUrl(user.profile_photo_url),
        calificacion: { promedio: Number(summary?.avg_rating ?? 0), cantidad: Number(summary?.rating_count ?? 0) },
        verificado: summary?.identity_verified ?? false,
      },
    };
  }
}
