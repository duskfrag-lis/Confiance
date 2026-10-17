import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { EvidenceService } from './evidence.service';
import { blockKeyOf, dayKeyOf } from './profiles.constants';
import { ProfilesService } from './profiles.service';

interface PublicSummary {
  avg_rating: string;
  rating_count: bigint;
  identity_verified: boolean;
  completed_services: bigint;
}

/**
 * HU-20 · Perfil público del prestador, sin sesión. Nunca incluye cédula, correo, teléfono, NIT, datos
 * bancarios ni documentos (HU-20.3): se arma campo por campo, no a partir del usuario completo.
 */
@Injectable()
export class PublicProfileService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private profiles: ProfilesService,
    private evidence: EvidenceService,
  ) {}

  async get(providerProfileId: bigint) {

    // La vista calcula al consultar la calificación, la insignia y los servicios completados (HU-20, regla
    // de implementación) y excluye las cuentas deshabilitadas (HU-20.4)
    const [summary] = await this.prisma.$queryRaw<PublicSummary[]>`
      SELECT avg_rating, rating_count, identity_verified, completed_services
      FROM v_provider_public_profile
      WHERE provider_profile_id = ${providerProfileId}`;

    if (!summary) throw new NotFoundException('El perfil no existe o ya no está disponible.');

    const profile = await this.prisma.provider_profiles.findUniqueOrThrow({
      where: { provider_profile_id: providerProfileId },
      select: {
        bio: true,
        users: { select: { first_name: true, last_name: true, profile_photo_url: true } },
        provider_categories: {
          select: { categories: { select: { category_id: true, category_name: true } } },
          orderBy: { category_id: 'asc' },
        },
        provider_service_areas: {
          select: { neighborhoods: { select: { neighborhood_id: true, neighborhood_name: true, commune_id: true } } },
        },
        provider_availability: {
          select: { days_of_week: { select: { day_name: true } }, time_blocks: { select: { block_name: true } } },
          orderBy: [{ day_of_week_id: 'asc' }, { time_block_id: 'asc' }],
        },
        service_listings: {
          where: { listing_statuses: { status_name: 'active' } },
          select: { service_listing_id: true, title: true, min_price: true, max_price: true },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    const zones = await this.profiles.groupZones(profile.provider_service_areas.map((a) => a.neighborhoods));

    return {
      id: String(providerProfileId),
      // Solo el primer nombre y el primer apellido
      nombre: `${profile.users.first_name} ${profile.users.last_name}`,
      fotoUrl: this.storage.publicUrl(profile.users.profile_photo_url),
      descripcion: profile.bio,
      oficios: profile.provider_categories.map(({ categories: c }) => ({ id: String(c.category_id), nombre: c.category_name })),
      zonas: zones.map(({ comuna, completa, barrios }) => ({ comuna, completa, barrios: barrios.map((b) => b.nombre) })),
      disponibilidad: profile.provider_availability.map((a) => ({
        dia: dayKeyOf(a.days_of_week.day_name),
        bloque: blockKeyOf(a.time_blocks.block_name),
      })),
      calificacion: { promedio: Number(summary.avg_rating), cantidad: Number(summary.rating_count) },
      serviciosCompletados: Number(summary.completed_services),
      verificado: summary.identity_verified,
      publicaciones: profile.service_listings.map((l) => ({
        id: String(l.service_listing_id),
        titulo: l.title,
        precioMin: Number(l.min_price),
        precioMax: Number(l.max_price),
      })),
      evidencias: await this.evidence.listPublished(providerProfileId),
    };
  }
}
