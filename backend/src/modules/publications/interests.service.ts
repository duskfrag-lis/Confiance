import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { blockKeyOf, dayKeyOf } from '../profiles/profiles.constants';
import type { InterestDto, SelectProviderDto } from './dto/publications.dto';
import { INTEREST_STATES, NEED_STATES, interestStateKeyOf } from './publications.constants';

interface ProviderSummary {
  provider_profile_id: bigint;
  avg_rating: string;
  rating_count: bigint;
  identity_verified: boolean;
  completed_services: bigint;
}

const NOT_AVAILABLE = 'La necesidad no existe o ya no está disponible.';

/** HU-29 · Mostrar interés en una necesidad y HU-30 · selección de prestador. */
@Injectable()
export class InterestsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-29 prestador

  /**
   * Solo en una necesidad que el prestador puede ver en el tablero (HU-28): abierta, con fecha futura, ajena y de
   * una cuenta no deshabilitada. Una vez por necesidad (HU-29.1). La necesidad se bloquea en modo compartido para
   * que no se cierre ni se seleccione a otro mientras tanto. Avisa al cliente (HU-29.2).
   */
  async create(userId: bigint, needId: bigint, dto: InterestDto) {

    const profile = await this.prisma.provider_profiles.findUniqueOrThrow({
      where: { user_id: userId },
      select: { provider_profile_id: true },
    });

    const interest = await this.prisma.$transaction(async (tx) => {

      await tx.$queryRaw`SELECT 1 FROM needs WHERE need_id = ${needId} FOR SHARE`;

      const need = await tx.needs.findFirst({
        where: {
          need_id: needId,
          need_statuses: { status_name: NEED_STATES.abierta },
          users: { account_statuses: { status_name: { not: 'disabled' } } },
          client_id: { not: userId },
          preferred_datetime: { gt: new Date() },
        },
        select: { client_id: true, title: true },
      });

      if (!need) throw new NotFoundException(NOT_AVAILABLE);

      const existing = await tx.need_interests.count({
        where: { need_id: needId, provider_profile_id: profile.provider_profile_id },
      });

      if (existing) throw apiError(HttpStatus.CONFLICT, 'INTEREST_EXISTS', 'Ya mostraste interés en esta necesidad.');

      const pending = await tx.interest_statuses.findUniqueOrThrow({ where: { status_name: INTEREST_STATES.pendiente } });

      const created = await tx.need_interests.create({
        data: {
          need_id: needId,
          provider_profile_id: profile.provider_profile_id,
          message: dto.mensaje ?? null,
          proposed_price: dto.precioPropuesto ?? null,
          status_id: pending.interest_status_id,
        },
      });

      await this.notifications.notify([{
        userId: need.client_id,
        type: 'interest_received',
        message: `Un prestador mostró interés en tu necesidad "${need.title}".`,
      }], tx);

      return { ...created, title: need.title };
    });

    return {
      id: String(interest.need_interest_id),
      necesidad: { id: String(needId), titulo: interest.title },
      mensaje: interest.message,
      precioPropuesto: interest.proposed_price === null ? null : Number(interest.proposed_price),
      estado: 'pendiente' as const,
      creado: interest.created_at.toISOString(),
    };
  }

  /** Los intereses del prestador con su resultado; si lo seleccionaron, el id de la solicitud creada. */
  async listOwn(userId: bigint) {

    const rows = await this.prisma.need_interests.findMany({
      where: { provider_profiles: { user_id: userId } },
      include: {
        interest_statuses: true,
        needs: {
          select: {
            need_id: true,
            title: true,
            preferred_datetime: true,
            service_requests: { where: { provider_profiles: { user_id: userId } }, select: { service_request_id: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((i) => ({
      id: String(i.need_interest_id),
      necesidad: { id: String(i.needs.need_id), titulo: i.needs.title, fechaPreferida: i.needs.preferred_datetime.toISOString() },
      mensaje: i.message,
      precioPropuesto: i.proposed_price === null ? null : Number(i.proposed_price),
      estado: interestStateKeyOf(i.interest_statuses.status_name),
      solicitudId: i.needs.service_requests[0] ? String(i.needs.service_requests[0].service_request_id) : null,
      creado: i.created_at.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- HU-30 cliente

  /**
   * HU-30.1: cada interesado con su perfil (resumen público), mensaje, precio propuesto y disponibilidad (HU-29.3).
   * Los de cuentas deshabilitadas no se muestran.
   */
  async listForNeed(userId: bigint, needId: bigint) {

    const need = await this.prisma.needs.findFirst({ where: { need_id: needId, client_id: userId }, select: { need_id: true } });

    if (!need) throw new NotFoundException('La necesidad no existe.');

    const rows = await this.prisma.need_interests.findMany({
      where: { need_id: needId, provider_profiles: { users: { account_statuses: { status_name: { not: 'disabled' } } } } },
      include: {
        interest_statuses: true,
        provider_profiles: {
          select: {
            provider_profile_id: true,
            users: { select: { first_name: true, last_name: true, profile_photo_url: true } },
            provider_availability: {
              select: { days_of_week: { select: { day_name: true } }, time_blocks: { select: { block_name: true } } },
              orderBy: [{ day_of_week_id: 'asc' }, { time_block_id: 'asc' }],
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const summaries = await this.summaries(rows.map((r) => r.provider_profile_id));

    return rows.map((i) => {
      const p = i.provider_profiles;
      const s = summaries.get(p.provider_profile_id);

      return {
        id: String(i.need_interest_id),
        prestador: {
          id: String(p.provider_profile_id),
          nombre: `${p.users.first_name} ${p.users.last_name}`,
          fotoUrl: this.storage.publicUrl(p.users.profile_photo_url),
          calificacion: { promedio: Number(s?.avg_rating ?? 0), cantidad: Number(s?.rating_count ?? 0) },
          verificado: s?.identity_verified ?? false,
          serviciosCompletados: Number(s?.completed_services ?? 0),
          disponibilidad: p.provider_availability.map((a) => ({
            dia: dayKeyOf(a.days_of_week.day_name),
            bloque: blockKeyOf(a.time_blocks.block_name),
          })),
        },
        mensaje: i.message,
        precioPropuesto: i.proposed_price === null ? null : Number(i.proposed_price),
        estado: interestStateKeyOf(i.interest_statuses.status_name),
        creado: i.created_at.toISOString(),
      };
    });
  }

  /**
   * HU-30: en una sola transacción, el interés elegido pasa a "seleccionado", los demás a "no seleccionado", la
   * necesidad a "prestador seleccionado" y se crea la solicitud en SOLICITADO con la fecha, el barrio y la
   * dirección de la necesidad (HU-30.4). El valor es el precio propuesto; si no hay (o es 0), el que indica el
   * cliente (HU-30.5, D-49: mayor que cero). La necesidad se bloquea para que un cierre o una segunda selección
   * simultánea no se crucen. Avisa al elegido y a los demás (HU-30.6).
   */
  async select(userId: bigint, needId: bigint, interestId: bigint, dto: SelectProviderDto) {

    return this.prisma.$transaction(async (tx) => {

      // Actor de la trazabilidad (audit_events) que escriben los triggers de la solicitud
      await tx.$queryRaw`SELECT set_config('app.user_id', ${String(userId)}, true)`;
      await tx.$queryRaw`SELECT 1 FROM needs WHERE need_id = ${needId} FOR UPDATE`;

      const need = await tx.needs.findFirst({
        where: { need_id: needId, client_id: userId },
        include: { need_statuses: true },
      });

      if (!need) throw new NotFoundException('La necesidad no existe.');

      if (need.need_statuses.status_name !== NEED_STATES.abierta) {

        throw apiError(HttpStatus.CONFLICT, 'NEED_STATE', 'Esta necesidad ya no está abierta.');
      }

      // La base no crea solicitudes en el pasado (regla 9 de la V7)
      if (need.preferred_datetime.getTime() <= Date.now()) {

        throw apiError(HttpStatus.CONFLICT, 'NEED_EXPIRED', 'La fecha preferida ya pasó. Cierra esta necesidad y publica otra con una fecha nueva.');
      }

      const interest = await tx.need_interests.findFirst({
        where: { need_interest_id: interestId, need_id: needId },
        include: {
          interest_statuses: true,
          provider_profiles: { select: { user_id: true, users: { select: { account_statuses: true } } } },
        },
      });

      if (!interest) throw new NotFoundException('El interés no existe.');

      // Si la necesidad se reabrió (su solicitud se rechazó o canceló), ese prestador quedó descartado
      if (interest.interest_statuses.status_name !== INTEREST_STATES.pendiente) {

        throw apiError(HttpStatus.CONFLICT, 'INTEREST_STATE', 'Este prestador ya no se puede elegir para esta necesidad.');
      }

      if (interest.provider_profiles.users.account_statuses.status_name === 'disabled') {

        throw apiError(HttpStatus.CONFLICT, 'PROVIDER_UNAVAILABLE', 'Este prestador ya no está disponible.');
      }

      const proposed = interest.proposed_price === null ? 0 : Number(interest.proposed_price);
      const price = proposed > 0 ? proposed : dto.valor;

      if (!price) {

        throw apiError(HttpStatus.BAD_REQUEST, 'PRICE_REQUIRED', 'Este prestador no propuso un precio: indica el valor del servicio.');
      }

      const [selected, notSelected, providerSelected, requested] = await Promise.all([
        tx.interest_statuses.findUniqueOrThrow({ where: { status_name: INTEREST_STATES.seleccionado } }),
        tx.interest_statuses.findUniqueOrThrow({ where: { status_name: INTEREST_STATES.no_seleccionado } }),
        tx.need_statuses.findUniqueOrThrow({ where: { status_name: NEED_STATES.prestador_seleccionado } }),
        tx.request_statuses.findUniqueOrThrow({ where: { status_name: 'solicitado' } }),
      ]);

      const others = await tx.need_interests.findMany({
        where: { need_id: needId, need_interest_id: { not: interestId } },
        select: { provider_profiles: { select: { user_id: true } } },
      });

      await tx.need_interests.update({ where: { need_interest_id: interestId }, data: { status_id: selected.interest_status_id } });
      await tx.need_interests.updateMany({
        where: { need_id: needId, need_interest_id: { not: interestId } },
        data: { status_id: notSelected.interest_status_id },
      });
      await tx.needs.update({ where: { need_id: needId }, data: { status_id: providerSelected.need_status_id } });

      const request = await tx.service_requests.create({
        data: {
          client_id: userId,
          provider_profile_id: interest.provider_profile_id,
          source_need_id: needId,
          proposed_datetime: need.preferred_datetime,
          neighborhood_id: need.neighborhood_id,
          exact_address: need.exact_address,
          agreed_price: price,
          status_id: requested.request_status_id,
        },
      });

      await this.notifications.notify([
        {
          userId: interest.provider_profiles.user_id,
          type: 'interest_selected',
          message: `El cliente te eligió para "${need.title}". Revisa la solicitud para aceptarla o rechazarla.`,
          serviceRequestId: request.service_request_id,
        },
        ...others.map((o) => ({
          userId: o.provider_profiles.user_id,
          type: 'interest_not_selected' as const,
          message: `El cliente eligió a otro prestador para "${need.title}".`,
        })),
      ], tx);

      return {
        solicitudId: String(request.service_request_id),
        estado: 'solicitado' as const,
        valor: price,
        fecha: need.preferred_datetime.toISOString(),
      };
    });
  }

  /**
   * HU-26.6: al cerrar una necesidad, sus intereses pendientes pasan a "no seleccionado" y se avisa a esos
   * prestadores. Corre dentro de la transacción del cierre.
   */
  async dismissPending(tx: Prisma.TransactionClient, needId: bigint, title: string) {

    const pending = await tx.need_interests.findMany({
      where: { need_id: needId, interest_statuses: { status_name: INTEREST_STATES.pendiente } },
      select: { need_interest_id: true, provider_profiles: { select: { user_id: true } } },
    });

    if (!pending.length) return;

    const notSelected = await tx.interest_statuses.findUniqueOrThrow({ where: { status_name: INTEREST_STATES.no_seleccionado } });

    await tx.need_interests.updateMany({
      where: { need_interest_id: { in: pending.map((p) => p.need_interest_id) } },
      data: { status_id: notSelected.interest_status_id },
    });

    await this.notifications.notify(pending.map((p) => ({
      userId: p.provider_profiles.user_id,
      type: 'interest_not_selected' as const,
      message: `El cliente cerró la necesidad "${title}".`,
    })), tx);
  }

  /** Calificación, insignia y servicios completados, calculados al consultar (misma vista del perfil público). */
  private async summaries(providerIds: bigint[]) {

    const ids = [...new Set(providerIds)];

    if (!ids.length) return new Map<bigint, ProviderSummary>();

    const rows = await this.prisma.$queryRaw<ProviderSummary[]>`
      SELECT provider_profile_id, avg_rating, rating_count, identity_verified, completed_services
      FROM v_provider_public_profile
      WHERE provider_profile_id IN (${Prisma.join(ids)})`;

    return new Map(rows.map((r) => [r.provider_profile_id, r]));
  }
}
