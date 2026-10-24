import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { fullName, lockRequest, requestState, titleOf } from '../contracting/contract-tx';
import type { RequestState } from '../contracting/contracting.constants';
import { NotificationsService, type NewNotification } from '../notifications/notifications.service';
import {
  ACTIVE_CLAIM_STATES, CLAIMABLE_STATES, CLAIMS_FOLDER, CLAIM_STATE_LABEL, CLAIM_TRANSITIONS, MAX_CLAIM_PHOTOS, REASONS,
  REASON_OF_NAME, type ClaimState,
} from './claims.constants';
import type { AdminClaimsQuery, ClaimStatusDto, CreateClaimDto } from './dto/claims.dto';

type Upload = { buffer: Buffer; size: number };

const PERSON = { first_name: true, last_name: true, profile_photo_url: true } satisfies Prisma.usersSelect;

const SELECT = {
  claim_id: true,
  service_request_id: true,
  filed_by: true,
  filed_against: true,
  description: true,
  created_at: true,
  updated_at: true,
  claim_reasons: { select: { reason_name: true } },
  claim_statuses: { select: { status_name: true } },
  claim_photos: { select: { photo_url: true }, orderBy: { claim_photo_id: 'asc' } },
  claim_status_history: {
    select: { note: true, changed_by: true, created_at: true, claim_statuses: { select: { status_name: true } }, users: { select: PERSON } },
    orderBy: [{ created_at: 'asc' }, { claim_status_history_id: 'asc' }],
  },
  users_claims_filed_byTousers: { select: PERSON },
  users_claims_filed_againstTousers: { select: PERSON },
  service_requests: {
    select: {
      client_id: true,
      proposed_datetime: true,
      agreed_price: true,
      request_statuses: { select: { status_name: true } },
      service_listings: { select: { title: true } },
      needs: { select: { title: true } },
      neighborhoods: { select: { neighborhood_name: true, communes: { select: { commune_name: true } } } },
    },
  },
} satisfies Prisma.claimsSelect;

type Row = Prisma.claimsGetPayload<{ select: typeof SELECT }>;

const NOT_FOUND = 'El reclamo no existe.';

/** Inicio de un día en hora de Colombia (UTC−5, sin horario de verano). */
const bogotaDay = (day: string, plusDays = 0) => new Date(new Date(`${day}T00:00:00-05:00`).getTime() + plusDays * 86_400_000);

/**
 * E12 · Reclamos: los presenta una parte contra la otra (HU-54) y los gestiona el administrador (HU-57). La base
 * revisa las partes (fn_check_claim_parties) y el máximo de 5 fotos. Cada cambio de estado queda en
 * claim_status_history con su resolución y su autor, y se avisa a las dos partes. Las fotos son privadas (HU-54.4,
 * HU-60): solo las ven las partes y el administrador, con enlaces firmados.
 */
@Injectable()
export class ClaimsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- HU-54 las partes

  /** HU-54.1 y HU-54.3: contra la otra parte, en FINALIZADO o COMPLETADO; queda abierto con quién y cuándo. */
  async create(userId: bigint, requestId: bigint, dto: CreateClaimDto, files: Upload[] | undefined) {

    if ((files?.length ?? 0) > MAX_CLAIM_PHOTOS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'CLAIM_PHOTOS', 'Puedes adjuntar máximo 5 fotos.');
    }

    const keys: string[] = [];
    let claimId: bigint;

    try {

      // Se validan y suben antes de abrir la transacción, para no tener la contratación bloqueada durante la subida
      for (const file of files ?? []) keys.push(await this.storage.uploadPrivatePhoto(CLAIMS_FOLDER, file));

      claimId = await this.prisma.$transaction(async (tx) => {

        const { request, side } = await lockRequest(tx, userId, requestId);

        if (!CLAIMABLE_STATES.includes(request.request_statuses.status_name as RequestState)) throw requestState();

        const against = side === 'client' ? request.provider_profiles.user_id : request.client_id;

        // Un reclamo activo por persona y contratación: lo demás se agrega en ese mismo reclamo con el administrador
        const active = await tx.claims.count({
          where: { service_request_id: requestId, filed_by: userId, claim_statuses: { status_name: { in: ACTIVE_CLAIM_STATES } } },
        });

        if (active) {

          throw apiError(HttpStatus.CONFLICT, 'CLAIM_OPEN', 'Ya tienes un reclamo activo sobre esta contratación.');
        }

        const [reason, open] = await Promise.all([
          tx.claim_reasons.findUniqueOrThrow({ where: { reason_name: REASONS[dto.motivo] } }),
          tx.claim_statuses.findUniqueOrThrow({ where: { status_name: 'abierto' } }),
        ]);

        const claim = await tx.claims.create({
          data: {
            service_request_id: requestId,
            filed_by: userId,
            filed_against: against,
            reason_id: reason.claim_reason_id,
            description: dto.descripcion,
            status_id: open.claim_status_id,
            claim_photos: { create: keys.map((photo_url) => ({ photo_url })) },
            claim_status_history: { create: { status_id: open.claim_status_id, changed_by: userId } },
          },
          select: { claim_id: true },
        });

        const filer = side === 'client' ? request.users : request.provider_profiles.users;

        await this.notifications.notify([{
          userId: against,
          type: 'claim_updated',
          message: `${fullName(filer)} presentó un reclamo sobre "${titleOf(request)}". El equipo de Confiance lo revisará `
            + 'y te contactará si lo necesita.',
          serviceRequestId: requestId,
        }], tx);

        return claim.claim_id;
      });

    } catch (err) {

      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw err;
    }

    return this.detail(userId, claimId);
  }

  /** HU-54.4: los reclamos en los que es parte, desde su perfil activo, del más reciente al más antiguo. */
  async mine(user: AuthUser) {

    const rows = await this.prisma.claims.findMany({
      where: {
        OR: [{ filed_by: user.userId }, { filed_against: user.userId }],
        service_requests: user.activeProfile === 'client'
          ? { client_id: user.userId }
          : { provider_profiles: { user_id: user.userId } },
      },
      select: SELECT,
      orderBy: [{ created_at: 'desc' }, { claim_id: 'desc' }],
    });

    return rows.map((r) => this.formatForParty(r, user.userId));
  }

  /** HU-54.4: a quien no es parte se le responde 404, sin revelar que existe. */
  async detail(userId: bigint, claimId: bigint) {

    const row = await this.prisma.claims.findUnique({ where: { claim_id: claimId }, select: SELECT });

    if (!row || (row.filed_by !== userId && row.filed_against !== userId)) throw new NotFoundException(NOT_FOUND);

    return this.formatForParty(row, userId);
  }

  // ---------------------------------------------------------------- HU-57 administrador

  /** HU-57.1: filtro por estado y por fecha de creación, del más reciente al más antiguo. */
  async adminList(query: AdminClaimsQuery) {

    if (query.desde && query.hasta && query.hasta < query.desde) {

      throw apiError(HttpStatus.BAD_REQUEST, 'DATE_RANGE', 'La fecha "hasta" debe ser igual o posterior a "desde".');
    }

    const rows = await this.prisma.claims.findMany({
      where: {
        ...(query.estado && { claim_statuses: { status_name: query.estado } }),
        ...((query.desde || query.hasta) && {
          created_at: {
            ...(query.desde && { gte: bogotaDay(query.desde) }),
            ...(query.hasta && { lt: bogotaDay(query.hasta, 1) }),
          },
        }),
      },
      select: SELECT,
      orderBy: [{ created_at: 'desc' }, { claim_id: 'desc' }],
    });

    return rows.map((r) => this.adminSummary(r));
  }

  /** HU-57.2: la contratación, las partes, el motivo, la descripción, las fotos y el historial con su administrador. */
  async adminDetail(claimId: bigint) {

    const row = await this.prisma.claims.findUnique({ where: { claim_id: claimId }, select: SELECT });

    if (!row) throw new NotFoundException(NOT_FOUND);

    const sr = row.service_requests;

    return {
      ...this.adminSummary(row),
      descripcion: row.description,
      fotos: this.photos(row),
      historial: row.claim_status_history.map((h, i) => ({
        ...this.step(h),
        // La primera fila es la apertura, hecha por quien presentó el reclamo
        admin: i === 0 ? null : fullName(h.users),
      })),
      contratacion: {
        id: String(row.service_request_id),
        servicio: this.titleOf(row),
        estado: sr.request_statuses.status_name,
        fechaHora: sr.proposed_datetime.toISOString(),
        valor: Number(sr.agreed_price),
        zona: `${sr.neighborhoods.neighborhood_name}, ${sr.neighborhoods.communes.commune_name}`,
      },
    };
  }

  /** HU-57.3 a HU-57.5: cambio de estado permitido, con la resolución aplicada; queda en el historial y se avisa. */
  async changeStatus(adminId: bigint, claimId: bigint, dto: ClaimStatusDto) {

    await this.prisma.$transaction(async (tx) => {

      // Dos administradores no pueden cambiar el mismo reclamo a la vez
      await tx.$queryRaw`SELECT 1 FROM claims WHERE claim_id = ${claimId} FOR UPDATE`;

      const claim = await tx.claims.findUnique({
        where: { claim_id: claimId },
        select: {
          filed_by: true,
          filed_against: true,
          service_request_id: true,
          claim_statuses: { select: { status_name: true } },
          service_requests: { select: { service_listings: { select: { title: true } }, needs: { select: { title: true } } } },
        },
      });

      if (!claim) throw new NotFoundException(NOT_FOUND);

      if (claim.filed_by === adminId || claim.filed_against === adminId) {

        throw apiError(HttpStatus.FORBIDDEN, 'OWN_CLAIM', 'No puedes gestionar un reclamo en el que eres parte.');
      }

      const from = claim.claim_statuses.status_name as ClaimState;

      if (!CLAIM_TRANSITIONS[from].includes(dto.estado)) {

        throw apiError(HttpStatus.CONFLICT, 'CLAIM_TRANSITION', `Un reclamo ${CLAIM_STATE_LABEL[from]} no puede pasar a ${CLAIM_STATE_LABEL[dto.estado]}.`);
      }

      const status = await tx.claim_statuses.findUniqueOrThrow({ where: { status_name: dto.estado } });

      await tx.claims.update({
        where: { claim_id: claimId },
        data: {
          status_id: status.claim_status_id,
          resolution: dto.resolucion,
          claim_status_history: { create: { status_id: status.claim_status_id, note: dto.resolucion, changed_by: adminId } },
        },
      });

      const title = claim.service_requests.service_listings?.title ?? claim.service_requests.needs?.title ?? 'el servicio';
      const notice = (userId: bigint, whose: string): NewNotification => ({
        userId,
        type: 'claim_updated',
        message: `${whose} sobre "${title}" pasó a ${CLAIM_STATE_LABEL[dto.estado]}: ${dto.resolucion}`,
        serviceRequestId: claim.service_request_id,
      });

      await this.notifications.notify([notice(claim.filed_by, 'Tu reclamo'), notice(claim.filed_against, 'El reclamo en tu contra')], tx);
    });

    return this.adminDetail(claimId);
  }

  // ---------------------------------------------------------------- auxiliares

  private formatForParty(r: Row, userId: bigint) {

    const mine = r.filed_by === userId;
    const other = mine ? r.users_claims_filed_againstTousers : r.users_claims_filed_byTousers;
    const state = r.claim_statuses.status_name as ClaimState;
    const closing = state === 'resuelto' || state === 'cerrado' ? r.claim_status_history.at(-1) : undefined;

    return {
      id: String(r.claim_id),
      contratacionId: String(r.service_request_id),
      servicio: this.titleOf(r),
      motivo: REASON_OF_NAME[r.claim_reasons.reason_name],
      descripcion: r.description,
      estado: state,
      creado: r.created_at.toISOString(),
      mio: mine,
      contraparte: { nombre: fullName(other), fotoUrl: this.storage.publicUrl(other.profile_photo_url) },
      fotos: this.photos(r),
      historial: r.claim_status_history.map((h) => this.step(h)),
      resolucion: closing?.note ? { texto: closing.note, fecha: closing.created_at.toISOString() } : null,
    };
  }

  private adminSummary(r: Row) {

    const role = (userId: bigint) => (userId === r.service_requests.client_id ? 'cliente' as const : 'prestador' as const);

    return {
      id: String(r.claim_id),
      contratacionId: String(r.service_request_id),
      servicio: this.titleOf(r),
      motivo: REASON_OF_NAME[r.claim_reasons.reason_name],
      estado: r.claim_statuses.status_name as ClaimState,
      creado: r.created_at.toISOString(),
      actualizado: r.updated_at.toISOString(),
      presentadoPor: { nombre: fullName(r.users_claims_filed_byTousers), rol: role(r.filed_by) },
      contra: { nombre: fullName(r.users_claims_filed_againstTousers), rol: role(r.filed_against) },
    };
  }

  private step(h: Row['claim_status_history'][number]) {

    return { estado: h.claim_statuses.status_name as ClaimState, fecha: h.created_at.toISOString(), nota: h.note };
  }

  private photos(r: Row) {

    return r.claim_photos.map((p) => this.storage.signedUrl(p.photo_url)!);
  }

  private titleOf(r: Row) {

    return r.service_requests.service_listings?.title ?? r.service_requests.needs?.title ?? 'el servicio';
  }
}
