import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_PREFIX, StorageService } from '../../storage/storage.service';
import { assertTrades } from '../categories/trades';
import type { ListingDto } from './dto/publications.dto';
import {
  CLOSED_REQUEST_STATES,
  LISTING_ACTIONS,
  LISTING_STATES,
  MAX_LISTING_PHOTOS,
  listingStateKeyOf,
  type ListingStateKey,
} from './publications.constants';

type Upload = { buffer: Buffer; size: number };

const INCLUDE = {
  listing_statuses: true,
  categories: { select: { category_id: true, category_name: true } },
  service_listing_photos: { orderBy: { service_listing_photo_id: 'asc' } },
} satisfies Prisma.service_listingsInclude;

type ListingRow = Prisma.service_listingsGetPayload<{ include: typeof INCLUDE }>;

/** HU-21 a HU-25 · Publicaciones de servicio del prestador. */
@Injectable()
export class ListingsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** HU-25: todas las del prestador, también las retiradas, de la más reciente a la más antigua. */
  async listOwn(userId: bigint, estado?: ListingStateKey) {

    const rows = await this.prisma.service_listings.findMany({
      where: {
        provider_profiles: { user_id: userId },
        ...(estado && { listing_statuses: { status_name: LISTING_STATES[estado] } }),
      },
      include: INCLUDE,
      orderBy: { created_at: 'desc' },
    });

    return rows.map((l) => this.format(l));
  }

  async getOwn(userId: bigint, listingId: bigint) {

    return this.format(await this.findOwn(userId, listingId));
  }

  /** HU-21: queda activa al crearla. Se valida todo antes de subir las fotos. */
  async create(userId: bigint, dto: ListingDto, files: Upload[] | undefined) {

    this.assertPrices(dto);

    if (!files?.length || files.length > MAX_LISTING_PHOTOS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'LISTING_PHOTOS', 'Adjunta entre 1 y 5 fotos del servicio.');
    }

    const [profile, active] = await Promise.all([
      this.prisma.provider_profiles.findUniqueOrThrow({ where: { user_id: userId }, select: { provider_profile_id: true } }),
      this.statusId('activo'),
    ]);

    await this.assertOwnTrade(profile.provider_profile_id, Number(dto.oficioId));

    const keys: string[] = [];

    try {

      // Se validan y suben una por una; si alguna falla, se borran las que ya se subieron
      for (const file of files) keys.push(await this.storage.uploadPublicPhoto(file));

      const listing = await this.prisma.service_listings.create({
        data: {
          provider_profile_id: profile.provider_profile_id,
          category_id: Number(dto.oficioId),
          title: dto.titulo,
          description: dto.descripcion,
          min_price: dto.precioMin,
          max_price: dto.precioMax,
          status_id: active,
          service_listing_photos: { create: keys.map((photo_url) => ({ photo_url })) },
        },
        include: INCLUDE,
      });

      return this.format(listing);

    } catch (err) {

      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw err;
    }
  }

  /**
   * HU-22: los mismos campos y validaciones de HU-21 (las fotos tienen sus propias rutas). Las contrataciones ya
   * creadas no cambian porque guardan su propio valor y dirección (HU-22.2).
   */
  async update(userId: bigint, listingId: bigint, dto: ListingDto) {

    const listing = await this.findOwn(userId, listingId);
    this.assertCan(listing, 'editar');
    this.assertPrices(dto);

    // Como el trigger de la base (D-55), el oficio solo se revisa si cambia: si el prestador lo quitó de su perfil
    // o se desactivó en el catálogo, se pueden seguir editando los demás campos
    if (Number(dto.oficioId) !== listing.category_id) await this.assertOwnTrade(listing.provider_profile_id, Number(dto.oficioId));

    const updated = await this.prisma.service_listings.update({
      where: { service_listing_id: listingId },
      data: {
        category_id: Number(dto.oficioId),
        title: dto.titulo,
        description: dto.descripcion,
        min_price: dto.precioMin,
        max_price: dto.precioMax,
      },
      include: INCLUDE,
    });

    return this.format(updated);
  }

  /** HU-22: agrega una foto, hasta 5. */
  async addPhoto(userId: bigint, listingId: bigint, file: Upload | undefined) {

    this.assertCan(await this.findOwn(userId, listingId), 'editar');

    const key = await this.storage.uploadPublicPhoto(file);

    try {

      await this.prisma.$transaction(async (tx) => {

        // Bloquea la publicación para que dos subidas a la vez no pasen de 5 ni se cuelen tras retirarla
        const listing = await this.lockOwn(tx, userId, listingId);
        this.assertCan(listing, 'editar');

        if (await tx.service_listing_photos.count({ where: { service_listing_id: listingId } }) >= MAX_LISTING_PHOTOS) {

          throw apiError(HttpStatus.BAD_REQUEST, 'LISTING_PHOTOS', 'La publicación ya tiene 5 fotos; quita una antes de agregar otra.');
        }

        await tx.service_listing_photos.create({ data: { service_listing_id: listingId, photo_url: key } });
      });

    } catch (err) {

      await this.storage.remove(key);
      throw err;
    }

    return this.getOwn(userId, listingId);
  }

  /** HU-22: quita una foto; siempre debe quedar al menos una (HU-21). */
  async removePhoto(userId: bigint, listingId: bigint, photoId: bigint) {

    const key = await this.prisma.$transaction(async (tx) => {

      const listing = await this.lockOwn(tx, userId, listingId);
      this.assertCan(listing, 'editar');

      const photo = await tx.service_listing_photos.findFirst({
        where: { service_listing_photo_id: photoId, service_listing_id: listingId },
      });

      if (!photo) throw new NotFoundException('La foto no existe.');

      if (await tx.service_listing_photos.count({ where: { service_listing_id: listingId } }) <= 1) {

        throw apiError(HttpStatus.BAD_REQUEST, 'LISTING_PHOTOS', 'La publicación debe tener al menos una foto.');
      }

      await tx.service_listing_photos.delete({ where: { service_listing_photo_id: photoId } });

      return photo.photo_url;
    });

    await this.storage.remove(key);

    return this.getOwn(userId, listingId);
  }

  /** HU-23: activa ↔ pausada. Repetir la acción en el estado al que lleva no hace nada. */
  async setPaused(userId: bigint, listingId: bigint, paused: boolean) {

    const listing = await this.findOwn(userId, listingId);
    const target: ListingStateKey = paused ? 'pausado' : 'activo';

    if (this.stateOf(listing) === target) return this.format(listing);

    this.assertCan(listing, paused ? 'pausar' : 'activar');

    const updated = await this.prisma.service_listings.update({
      where: { service_listing_id: listingId },
      data: { status_id: await this.statusId(target) },
      include: INCLUDE,
    });

    return this.format(updated);
  }

  /**
   * HU-24: solo sin contrataciones abiertas (la base también lo impide), y es definitivo. Se conserva, pero sus
   * fotos pasan a la zona de retiradas para que /media deje de servirlas, como las evidencias (HU-19.3): se
   * copian antes de tocar la base y los originales se borran al final. Repetirla termina de mover las fotos.
   */
  async withdraw(userId: bigint, listingId: bigint) {

    const listing = await this.findOwn(userId, listingId);
    const photos = listing.service_listing_photos.filter((p) => p.photo_url.startsWith(PUBLIC_PREFIX));
    const alreadyWithdrawn = this.stateOf(listing) === 'retirado';

    if (alreadyWithdrawn && !photos.length) return;

    if (!alreadyWithdrawn) await this.assertNoOpenContracts(listingId);

    const withdrawn = await this.statusId('retirado');
    const copies: string[] = [];

    try {

      for (const photo of photos) copies.push(await this.storage.copyToWithdrawn(photo.photo_url));

      await this.prisma.$transaction([
        this.prisma.service_listings.update({ where: { service_listing_id: listingId }, data: { status_id: withdrawn } }),
        ...photos.map((photo, i) => this.prisma.service_listing_photos.update({
          where: { service_listing_photo_id: photo.service_listing_photo_id },
          data: { photo_url: copies[i] },
        })),
      ]);

    } catch (err) {

      await Promise.all(copies.map((k) => this.storage.remove(k)));

      // Si entre la revisión y el cambio se abrió una contratación, el trigger lo frena: se responde lo mismo
      if (!alreadyWithdrawn) await this.assertNoOpenContracts(listingId);
      throw err;
    }

    await Promise.all(photos.map((p) => this.storage.remove(p.photo_url)));

    // Una foto agregada entre la lectura y el cambio de estado quedaría pública: se mueve en otra vuelta.
    // Ya retirada, addPhoto la rechaza, así que esto termina
    const left = await this.prisma.service_listing_photos.count({
      where: { service_listing_id: listingId, photo_url: { startsWith: PUBLIC_PREFIX } },
    });

    if (left) await this.withdraw(userId, listingId);
  }

  // ---------------------------------------------------------------- apoyo

  private async findOwn(userId: bigint, listingId: bigint) {

    const listing = await this.prisma.service_listings.findFirst({
      where: { service_listing_id: listingId, provider_profiles: { user_id: userId } },
      include: INCLUDE,
    });

    if (!listing) throw new NotFoundException('La publicación no existe.');

    return listing;
  }

  private async lockOwn(tx: Prisma.TransactionClient, userId: bigint, listingId: bigint) {

    await tx.$queryRaw`SELECT 1 FROM service_listings WHERE service_listing_id = ${listingId} FOR UPDATE`;

    const listing = await tx.service_listings.findFirst({
      where: { service_listing_id: listingId, provider_profiles: { user_id: userId } },
      include: { listing_statuses: true },
    });

    if (!listing) throw new NotFoundException('La publicación no existe.');

    return listing;
  }

  private async assertNoOpenContracts(listingId: bigint) {

    const open = await this.prisma.service_requests.count({
      where: { source_service_listing_id: listingId, request_statuses: { status_name: { notIn: CLOSED_REQUEST_STATES } } },
    });

    if (open) {

      throw apiError(
        HttpStatus.CONFLICT,
        'LISTING_OPEN_CONTRACTS',
        'No puedes retirar esta publicación mientras tenga contrataciones sin terminar.',
      );
    }
  }

  /** HU-21 (decidido el 2026-10-19): el oficio debe ser uno de los del perfil (HU-14) y seguir activo en el catálogo. */
  private async assertOwnTrade(providerProfileId: bigint, tradeId: number) {

    await assertTrades(this.prisma, [tradeId]);

    const offered = await this.prisma.provider_categories.count({
      where: { provider_profile_id: providerProfileId, category_id: tradeId },
    });

    if (!offered) {

      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TRADE_NOT_OFFERED',
        'Solo puedes publicar servicios de los oficios de tu perfil. Agrega el oficio en tu perfil profesional.',
      );
    }
  }

  /** HU-21.1 */
  private assertPrices(dto: ListingDto) {

    if (dto.precioMax < dto.precioMin) {

      throw apiError(HttpStatus.BAD_REQUEST, 'PRICE_RANGE', 'El precio máximo debe ser mayor o igual que el mínimo.');
    }
  }

  private assertCan(listing: { listing_statuses: { status_name: string } }, action: 'editar' | 'pausar' | 'activar') {

    const state = this.stateOf(listing);

    if (LISTING_ACTIONS[state].includes(action)) return;

    const message = state === 'retirado'
      ? 'Esta publicación está retirada y ya no se puede cambiar.'
      : action === 'pausar' ? 'Solo puedes pausar una publicación activa.'
        : action === 'activar' ? 'Solo puedes activar una publicación pausada.'
          : 'Esta publicación no se puede editar en su estado actual.';

    throw apiError(HttpStatus.CONFLICT, 'LISTING_STATE', message);
  }

  private stateOf(listing: { listing_statuses: { status_name: string } }) {

    return listingStateKeyOf(listing.listing_statuses.status_name);
  }

  private async statusId(state: ListingStateKey) {

    const row = await this.prisma.listing_statuses.findUniqueOrThrow({ where: { status_name: LISTING_STATES[state] } });
    return row.listing_status_id;
  }

  private format(l: ListingRow) {

    const estado = this.stateOf(l);

    return {
      id: String(l.service_listing_id),
      titulo: l.title,
      oficio: { id: String(l.categories.category_id), nombre: l.categories.category_name },
      descripcion: l.description,
      precioMin: Number(l.min_price),
      precioMax: Number(l.max_price),
      // HU-21.2: con ambos precios iguales la interfaz muestra "precio fijo"
      precioFijo: Number(l.min_price) === Number(l.max_price),
      moneda: 'COP',
      estado,
      acciones: LISTING_ACTIONS[estado],
      // Las de una publicación retirada no tienen URL pública (HU-24.3)
      fotos: l.service_listing_photos
        .map((p) => ({ id: String(p.service_listing_photo_id), url: this.storage.publicUrl(p.photo_url) }))
        .filter((p) => p.url !== null),
      creada: l.created_at.toISOString(),
      actualizada: l.updated_at.toISOString(),
    };
  }
}
