import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_PREFIX, StorageService } from '../../storage/storage.service';
import { assertTrades } from '../categories/trades';
import type { NeedDto, NeedsBoardQuery } from './dto/publications.dto';
import { InterestsService } from './interests.service';
import { CATALOG_PAGE_SIZE, MAX_NEED_PHOTOS, NEED_STATES, needStateKeyOf, type NeedStateKey } from './publications.constants';

type Upload = { buffer: Buffer; size: number };

const INCLUDE = {
  need_statuses: true,
  categories: { select: { category_id: true, category_name: true } },
  neighborhoods: { select: { neighborhood_id: true, neighborhood_name: true, communes: { select: { commune_id: true, commune_name: true } } } },
  need_photos: { orderBy: { need_photo_id: 'asc' } },
} satisfies Prisma.needsInclude;

type NeedRow = Prisma.needsGetPayload<{ include: typeof INCLUDE }>;

/** HU-26 · Necesidades del cliente y HU-28 · consulta de necesidades por los prestadores. */
@Injectable()
export class NeedsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private interests: InterestsService,
  ) {}

  // ---------------------------------------------------------------- HU-26 cliente

  /** Todas las del cliente, también las cerradas, de la más reciente a la más antigua. */
  async listOwn(userId: bigint, estado?: NeedStateKey) {

    const rows = await this.prisma.needs.findMany({
      where: { client_id: userId, ...(estado && { need_statuses: { status_name: NEED_STATES[estado] } }) },
      include: INCLUDE,
      orderBy: { created_at: 'desc' },
    });

    return rows.map((n) => this.formatOwn(n));
  }

  /**
   * Con `solicitudId` de la contratación vigente cuando ya eligió prestador (HU-30), para enlazarla. Si esa
   * solicitud se rechazó o canceló, la necesidad volvió a abierta y no hay solicitud vigente.
   */
  async getOwn(userId: bigint, needId: bigint) {

    const need = this.formatOwn(await this.findOwn(userId, needId));

    const request = need.estado === 'prestador_seleccionado'
      ? await this.prisma.service_requests.findFirst({
        where: { source_need_id: needId },
        orderBy: { created_at: 'desc' },
        select: { service_request_id: true },
      })
      : null;

    return { ...need, solicitudId: request ? String(request.service_request_id) : null };
  }

  /** HU-26: queda abierta. Todo se valida antes de subir las fotos (opcionales, hasta 5). */
  async create(userId: bigint, dto: NeedDto, files: Upload[] | undefined) {

    if (dto.presupuestoMax < dto.presupuestoMin) {

      throw apiError(HttpStatus.BAD_REQUEST, 'BUDGET_RANGE', 'El presupuesto máximo debe ser mayor o igual que el mínimo.');
    }

    const preferred = new Date(dto.fechaPreferida);

    // HU-26.2 y regla 9 de la V7: nada hacia el pasado
    if (preferred.getTime() <= Date.now()) {

      throw apiError(HttpStatus.BAD_REQUEST, 'PAST_DATE', 'La fecha y hora preferidas deben ser futuras.');
    }

    if ((files?.length ?? 0) > MAX_NEED_PHOTOS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'NEED_PHOTOS', 'Puedes adjuntar máximo 5 fotos.');
    }

    await assertTrades(this.prisma, [Number(dto.oficioId)]);
    await this.assertNeighborhood(Number(dto.barrioId));

    const open = await this.statusId('abierta');
    const keys: string[] = [];

    try {

      // Se validan y suben una por una; si alguna falla, se borran las que ya se subieron
      for (const file of files ?? []) keys.push(await this.storage.uploadPublicPhoto(file));

      const need = await this.prisma.needs.create({
        data: {
          client_id: userId,
          title: dto.titulo,
          description: dto.descripcion,
          category_id: Number(dto.oficioId),
          neighborhood_id: Number(dto.barrioId),
          exact_address: dto.direccion,
          preferred_datetime: preferred,
          budget_min: dto.presupuestoMin,
          budget_max: dto.presupuestoMax,
          status_id: open,
          need_photos: { create: keys.map((photo_url) => ({ photo_url })) },
        },
        include: INCLUDE,
      });

      return this.formatOwn(need);

    } catch (err) {

      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw err;
    }
  }

  /**
   * HU-26.6: solo una abierta, y deja de recibir intereses (la base solo los acepta en una abierta); los que tenía
   * pendientes pasan a "no seleccionado", con aviso a sus prestadores. Las fotos pueden mostrar el interior de la
   * casa del cliente, así que pasan a la zona de retiradas: /media deja de
   * servirlas, pero se conservan por si una autoridad las solicita (decidido el 2026-10-19). Se copian antes de
   * tocar la base y los originales se borran al final. Cerrarla otra vez termina de mover las que hayan quedado.
   */
  async close(userId: bigint, needId: bigint) {

    const need = await this.findOwn(userId, needId);
    const state = this.stateOf(need);

    if (state === 'prestador_seleccionado') {

      throw apiError(HttpStatus.CONFLICT, 'NEED_STATE', 'Ya elegiste un prestador para esta necesidad; no se puede cerrar.');
    }

    const photos = need.need_photos.filter((p) => p.photo_url.startsWith(PUBLIC_PREFIX));

    if (state === 'cerrada' && !photos.length) return this.formatOwn(need);

    const closed = await this.statusId('cerrada');
    const copies: string[] = [];

    try {

      for (const photo of photos) copies.push(await this.storage.copyToWithdrawn(photo.photo_url));

      await this.prisma.$transaction(async (tx) => {

        // Solo si sigue abierta: si justo se seleccionó un prestador (HU-30), gana la selección
        if (state === 'abierta') {

          const { count } = await tx.needs.updateMany({
            where: { need_id: needId, need_statuses: { status_name: NEED_STATES.abierta } },
            data: { status_id: closed },
          });

          if (!count) throw apiError(HttpStatus.CONFLICT, 'NEED_STATE', 'Esta necesidad cambió de estado; vuelve a cargarla.');

          // Los intereses pendientes pasan a "no seleccionado" y se avisa a esos prestadores
          await this.interests.dismissPending(tx, needId, need.title);
        }

        for (const [i, photo] of photos.entries()) {

          await tx.need_photos.update({ where: { need_photo_id: photo.need_photo_id }, data: { photo_url: copies[i] } });
        }
      });

    } catch (err) {

      await Promise.all(copies.map((k) => this.storage.remove(k)));
      throw err;
    }

    await Promise.all(photos.map((p) => this.storage.remove(p.photo_url)));

    return this.getOwn(userId, needId);
  }

  // ---------------------------------------------------------------- HU-28 prestador

  /**
   * Solo abiertas, de cuentas no deshabilitadas (HU-28.1), con fecha preferida futura (decidido el 2026-10-19:
   * una vencida ya no puede contratarse) y que no sean del mismo usuario. Nunca la dirección exacta ni datos del
   * cliente (HU-28.4).
   *
   * Orden (decidido el 2026-10-19): primero las de los oficios del prestador y después las de otros oficios, sin
   * excluirlas; dentro de cada grupo, la más reciente primero. Se pagina sobre los dos grupos seguidos.
   */
  async board(userId: bigint, query: NeedsBoardQuery) {

    const page = query.pagina ?? 1;
    const size = query.tamano ?? CATALOG_PAGE_SIZE;
    const where = this.visible(userId, query);

    const trades = await this.prisma.provider_categories.findMany({
      where: { provider_profiles: { user_id: userId } },
      select: { category_id: true },
    });
    const tradeIds = trades.map((t) => t.category_id);

    const own: Prisma.needsWhereInput = { AND: [where, { category_id: { in: tradeIds } }] };
    const others: Prisma.needsWhereInput = { AND: [where, { category_id: { notIn: tradeIds } }] };

    const [ownTotal, othersTotal] = await Promise.all([this.prisma.needs.count({ where: own }), this.prisma.needs.count({ where: others })]);

    const skip = (page - 1) * size;
    const ownRows = skip < ownTotal ? await this.page(own, skip, size) : [];
    const otherRows = ownRows.length < size ? await this.page(others, Math.max(0, skip - ownTotal), size - ownRows.length) : [];

    return {
      total: ownTotal + othersTotal,
      pagina: page,
      tamano: size,
      resultados: [
        ...ownRows.map((n) => ({ ...this.formatPublic(n), deTuOficio: true })),
        ...otherRows.map((n) => ({ ...this.formatPublic(n), deTuOficio: false })),
      ],
    };
  }

  private page(where: Prisma.needsWhereInput, skip: number, take: number) {

    return this.prisma.needs.findMany({ where, include: INCLUDE, orderBy: [{ created_at: 'desc' }, { need_id: 'desc' }], skip, take });
  }

  async getForProvider(userId: bigint, needId: bigint) {

    const need = await this.prisma.needs.findFirst({ where: { need_id: needId, ...this.visible(userId, {}) }, include: INCLUDE });

    if (!need) throw new NotFoundException('La necesidad no existe o ya no está disponible.');

    return this.formatPublic(need);
  }

  // ---------------------------------------------------------------- apoyo

  private visible(userId: bigint, query: Pick<NeedsBoardQuery, 'categoriaId' | 'comunaId' | 'barrioId'>): Prisma.needsWhereInput {

    const categoryId = query.categoriaId ? Number(query.categoriaId) : undefined;

    return {
      need_statuses: { status_name: NEED_STATES.abierta },
      users: { account_statuses: { status_name: { not: 'disabled' } } },
      client_id: { not: userId },
      preferred_datetime: { gt: new Date() },
      // D-55: una categoría incluye todos sus oficios; también se puede pedir un oficio
      ...(categoryId !== undefined && { OR: [{ category_id: categoryId }, { categories: { parent_category_id: categoryId } }] }),
      ...(query.barrioId && { neighborhood_id: Number(query.barrioId) }),
      ...(query.comunaId && { neighborhoods: { commune_id: Number(query.comunaId) } }),
    };
  }

  private async findOwn(userId: bigint, needId: bigint) {

    const need = await this.prisma.needs.findFirst({ where: { need_id: needId, client_id: userId }, include: INCLUDE });

    if (!need) throw new NotFoundException('La necesidad no existe.');

    return need;
  }

  private async assertNeighborhood(id: number) {

    const found = await this.prisma.neighborhoods.count({
      where: { neighborhood_id: id, is_active: true, communes: { is_active: true } },
    });

    if (!found) throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_ZONE', 'El barrio no existe o no está disponible.');
  }

  private stateOf(need: { need_statuses: { status_name: string } }) {

    return needStateKeyOf(need.need_statuses.status_name);
  }

  private async statusId(state: NeedStateKey) {

    const row = await this.prisma.need_statuses.findUniqueOrThrow({ where: { status_name: NEED_STATES[state] } });
    return row.need_status_id;
  }

  /** Lo que ve cualquier prestador (HU-28.3): sin dirección exacta ni datos del cliente. */
  private formatPublic(n: NeedRow) {

    return {
      id: String(n.need_id),
      titulo: n.title,
      descripcion: n.description,
      oficio: { id: String(n.categories.category_id), nombre: n.categories.category_name },
      zona: {
        barrioId: String(n.neighborhoods.neighborhood_id),
        barrio: n.neighborhoods.neighborhood_name,
        comunaId: String(n.neighborhoods.communes.commune_id),
        comuna: n.neighborhoods.communes.commune_name,
      },
      fechaPreferida: n.preferred_datetime.toISOString(),
      presupuestoMin: Number(n.budget_min),
      presupuestoMax: Number(n.budget_max),
      moneda: 'COP',
      // Las de una necesidad cerrada no tienen URL pública
      fotos: n.need_photos.map((p) => this.storage.publicUrl(p.photo_url)).filter((url) => url !== null),
      publicada: n.created_at.toISOString(),
    };
  }

  /** Lo que ve el cliente dueño: todo, con la dirección exacta y el estado. */
  private formatOwn(n: NeedRow) {

    const estado = this.stateOf(n);

    return {
      ...this.formatPublic(n),
      direccion: n.exact_address,
      estado,
      // Abierta pero con la fecha ya pasada: los prestadores ya no la ven (HU-28); el front puede sugerir cerrarla
      vencida: estado === 'abierta' && n.preferred_datetime.getTime() <= Date.now(),
      acciones: estado === 'abierta' ? ['cerrar'] : [],
    };
  }
}
