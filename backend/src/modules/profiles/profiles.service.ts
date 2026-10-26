import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { STATE_OF } from '../verification/verification.constants';
import { splitName } from '../auth/auth.service';
import { assertTrades } from '../categories/trades';
import type {
  ProviderAvailabilityDto,
  ProviderDescriptionDto,
  ProviderTradesDto,
  ProviderZonesDto,
  UpdateClientProfileDto,
} from './dto/profiles.dto';
import { BLOCKS, DAYS, EvidenceStatus, blockKeyOf, dayKeyOf, type ProviderSection } from './profiles.constants';

const fullName = (first: string, middle: string | null) => [first, middle].filter(Boolean).join(' ');

@Injectable()
export class ProfilesService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- foto (cliente y prestador)

  /** HU-11.3 / HU-13: la foto es de la cuenta y se muestra en los dos perfiles. Reemplaza la anterior. */
  async updatePhoto(userId: bigint, file: { buffer: Buffer; size: number } | undefined) {

    const key = await this.storage.uploadPublicPhoto(file);

    const previous = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      select: { profile_photo_url: true },
    });

    await this.prisma.users.update({ where: { user_id: userId }, data: { profile_photo_url: key } });

    if (previous.profile_photo_url) await this.storage.remove(previous.profile_photo_url);

    return { fotoUrl: this.storage.publicUrl(key) };
  }

  // ---------------------------------------------------------------- HU-11 perfil del cliente

  async getClient(userId: bigint) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      include: {
        client_profiles: { include: { neighborhoods: { include: { communes: true } } } },
      },
    });

    const profile = user.client_profiles!;
    const zone = profile.neighborhoods;

    return {
      nombres: fullName(user.first_name, user.middle_name),
      apellidos: fullName(user.last_name, user.second_last_name),
      celular: user.phone,
      correo: user.email,
      cedula: user.id_number,
      fotoUrl: this.storage.publicUrl(user.profile_photo_url),
      zona: zone
        ? { barrioId: String(zone.neighborhood_id), barrio: zone.neighborhood_name, comunaId: String(zone.commune_id), comuna: zone.communes.commune_name }
        : null,
      direccion: profile.reference_address,
      descripcion: profile.description,
    };
  }

  async updateClient(userId: bigint, dto: UpdateClientProfileDto) {

    const neighborhoodId = dto.barrioId ? Number(dto.barrioId) : null;

    if (neighborhoodId !== null) await this.assertNeighborhoods([neighborhoodId]);

    const [first_name, middle_name] = splitName(dto.nombres);
    const [last_name, second_last_name] = splitName(dto.apellidos);

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { user_id: userId },
        data: { first_name, middle_name, last_name, second_last_name, phone: dto.celular },
      }),
      this.prisma.client_profiles.update({
        where: { user_id: userId },
        data: {
          reference_neighborhood_id: neighborhoodId,
          reference_address: dto.direccion ?? null,
          description: dto.descripcion ?? null,
        },
      }),
    ]);

    return this.getClient(userId);
  }

  // ---------------------------------------------------------------- HU-13 a HU-17 perfil profesional

  async getProvider(userId: bigint) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      select: {
        profile_photo_url: true,
        provider_profiles: {
          select: {
            bio: true,
            provider_categories: {
              select: { categories: { select: { category_id: true, category_name: true, categories: { select: { category_name: true } } } } },
              orderBy: { category_id: 'asc' },
            },
            provider_service_areas: {
              select: { neighborhoods: { select: { neighborhood_id: true, neighborhood_name: true, commune_id: true } } },
            },
            provider_availability: {
              select: { days_of_week: { select: { day_name: true } }, time_blocks: { select: { block_name: true } } },
              orderBy: [{ day_of_week_id: 'asc' }, { time_block_id: 'asc' }],
            },
            // HU-55: solo la más reciente cuenta para el estado (y para la insignia, HU-56.1)
            identity_verifications: {
              select: { verification_statuses: { select: { status_name: true } } },
              orderBy: [{ created_at: 'desc' }, { identity_verification_id: 'desc' }],
              take: 1,
            },
            // HU-13.3: las retiradas no cuentan; si todas lo están, la sección vuelve a faltar
            _count: { select: { work_evidence: { where: { evidence_statuses: { status_name: EvidenceStatus.PUBLISHED } } } } },
          },
        },
      },
    });

    const profile = user.provider_profiles!;

    const trades = profile.provider_categories.map(({ categories: c }) => ({
      id: String(c.category_id),
      nombre: c.category_name,
      categoria: c.categories?.category_name ?? null,
    }));

    const zones = await this.groupZones(profile.provider_service_areas.map((a) => a.neighborhoods));

    const availability = profile.provider_availability.map((a) => ({
      dia: dayKeyOf(a.days_of_week.day_name),
      bloque: blockKeyOf(a.time_blocks.block_name),
    }));

    const missing: ProviderSection[] = [];
    if (!user.profile_photo_url) missing.push('foto');
    if (!profile.bio?.trim()) missing.push('descripcion');
    if (!trades.length) missing.push('oficios');
    if (!zones.length) missing.push('zonas');
    if (!availability.length) missing.push('disponibilidad');
    if (!profile._count.work_evidence) missing.push('evidencias');

    return {
      fotoUrl: this.storage.publicUrl(user.profile_photo_url),
      descripcion: profile.bio,
      oficios: trades,
      zonas: zones,
      disponibilidad: availability,
      evidencias: profile._count.work_evidence,
      verificacion: STATE_OF[profile.identity_verifications[0]?.verification_statuses.status_name ?? ''] ?? null,
      // HU-15.2: sin descripción el perfil está incompleto
      completo: missing.length === 0,
      faltantes: missing,
    };
  }

  async updateDescription(userId: bigint, dto: ProviderDescriptionDto) {

    await this.prisma.provider_profiles.update({ where: { user_id: userId }, data: { bio: dto.descripcion } });

    return this.getProvider(userId);
  }

  async updateTrades(userId: bigint, dto: ProviderTradesDto) {

    const categoryIds = dto.oficios.map(Number);

    await assertTrades(this.prisma, categoryIds);

    const { provider_profile_id } = await this.providerOf(userId);

    await this.prisma.$transaction([
      this.prisma.provider_categories.deleteMany({ where: { provider_profile_id } }),
      this.prisma.provider_categories.createMany({
        data: categoryIds.map((category_id) => ({ provider_profile_id, category_id })),
      }),
    ]);

    return this.getProvider(userId);
  }

  async updateZones(userId: bigint, dto: ProviderZonesDto) {

    const neighborhoodIds = new Set((dto.barrios ?? []).map(Number));
    const communeIds = [...new Set((dto.comunas ?? []).map(Number))];

    if (neighborhoodIds.size) await this.assertNeighborhoods([...neighborhoodIds]);

    if (communeIds.length) {

      const communes = await this.prisma.communes.findMany({
        where: { commune_id: { in: communeIds }, is_active: true },
        select: { neighborhoods: { where: { is_active: true }, select: { neighborhood_id: true } } },
      });

      if (communes.length !== communeIds.length) {

        throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_ZONE', 'Alguna comuna no existe o no está disponible.');
      }

      communes.forEach((c) => c.neighborhoods.forEach((n) => neighborhoodIds.add(n.neighborhood_id)));
    }

    if (!neighborhoodIds.size) {

      throw apiError(HttpStatus.BAD_REQUEST, 'ZONES_REQUIRED', 'Elige al menos un barrio donde atiendes.');
    }

    const { provider_profile_id } = await this.providerOf(userId);

    await this.prisma.$transaction([
      this.prisma.provider_service_areas.deleteMany({ where: { provider_profile_id } }),
      this.prisma.provider_service_areas.createMany({
        data: [...neighborhoodIds].map((neighborhood_id) => ({ provider_profile_id, neighborhood_id })),
      }),
    ]);

    return this.getProvider(userId);
  }

  /** HU-17.3: las contrataciones aceptadas no dependen de esta tabla, así que no se ven afectadas. */
  async updateAvailability(userId: bigint, dto: ProviderAvailabilityDto) {

    const [days, blocks, { provider_profile_id }] = await Promise.all([
      this.prisma.days_of_week.findMany(),
      this.prisma.time_blocks.findMany(),
      this.providerOf(userId),
    ]);

    const dayId = new Map(days.map((d) => [d.day_name, d.day_of_week_id]));
    const blockId = new Map(blocks.map((b) => [b.block_name, b.time_block_id]));

    const unique = new Map(dto.franjas.map((f) => [`${f.dia}-${f.bloque}`, f]));

    await this.prisma.$transaction([
      this.prisma.provider_availability.deleteMany({ where: { provider_profile_id } }),
      this.prisma.provider_availability.createMany({
        data: [...unique.values()].map((f) => ({
          provider_profile_id,
          day_of_week_id: dayId.get(DAYS[f.dia])!,
          time_block_id: blockId.get(BLOCKS[f.bloque])!,
        })),
      }),
    ]);

    return this.getProvider(userId);
  }

  // ---------------------------------------------------------------- utilidades

  private async providerOf(userId: bigint) {

    return this.prisma.provider_profiles.findUniqueOrThrow({
      where: { user_id: userId },
      select: { provider_profile_id: true },
    });
  }

  /** HU-16.4 / HU-11: solo barrios activos de comunas activas. */
  private async assertNeighborhoods(ids: number[]) {

    const found = await this.prisma.neighborhoods.count({
      where: { neighborhood_id: { in: ids }, is_active: true, communes: { is_active: true } },
    });

    if (found !== ids.length) {

      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_ZONE', 'Algún barrio no existe o no está disponible.');
    }
  }

  /** Agrupa por comuna y marca si la comuna quedó completa (HU-16.2). También lo usa el perfil público. */
  async groupZones(neighborhoods: { neighborhood_id: number; neighborhood_name: string; commune_id: number }[]) {

    if (!neighborhoods.length) return [];

    const communes = await this.prisma.communes.findMany({
      where: { commune_id: { in: [...new Set(neighborhoods.map((n) => n.commune_id))] } },
      select: {
        commune_id: true,
        commune_name: true,
        _count: { select: { neighborhoods: { where: { is_active: true } } } },
      },
      orderBy: { commune_name: 'asc' },
    });

    return communes.map((c) => {

      const barrios = neighborhoods
        .filter((n) => n.commune_id === c.commune_id)
        .map((n) => ({ id: String(n.neighborhood_id), nombre: n.neighborhood_name }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      return {
        comunaId: String(c.commune_id),
        comuna: c.commune_name,
        completa: barrios.length >= c._count.neighborhoods,
        barrios,
      };
    });
  }
}
