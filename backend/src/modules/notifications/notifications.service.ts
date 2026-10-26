import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_LIMIT, NOTIFICATION_VIEW, PROVIDER_ONLY_TYPES, type NotificationTypeName } from './notifications.constants';

/** Tipos del catálogo notification_types que usa el backend (se buscan por nombre). */
export type NotificationType = NotificationTypeName;

export interface NewNotification {
  userId: bigint;
  type: NotificationType;
  /** Máximo 300 caracteres (columna message). */
  message: string;
  serviceRequestId?: bigint;
  /** Para los avisos de una necesidad (HU-25, HU-30): a dónde lleva la notificación (HU-62.3). */
  needId?: bigint;
}

const LIST_SELECT = {
  notification_id: true,
  message: true,
  is_read: true,
  created_at: true,
  related_service_request_id: true,
  related_need_id: true,
  notification_types: { select: { type_name: true } },
} satisfies Prisma.notificationsSelect;

/**
 * Notificaciones dentro de la plataforma. Se guardan en la misma transacción que el cambio que las origina,
 * así nunca queda un aviso de algo que no pasó (notify). La bandeja (HU-62) las muestra por perfil activo,
 * igual que las contrataciones y la agenda.
 */
@Injectable()
export class NotificationsService {

  constructor(private prisma: PrismaService) {}

  async notify(items: NewNotification[], tx: Prisma.TransactionClient = this.prisma) {

    if (!items.length) return;

    const types = await tx.notification_types.findMany({ where: { type_name: { in: [...new Set(items.map((i) => i.type))] } } });
    const idOf = new Map(types.map((t) => [t.type_name, t.notification_type_id]));

    await tx.notifications.createMany({
      data: items.map((i) => ({
        user_id: i.userId,
        notification_type_id: idOf.get(i.type)!,
        message: i.message.slice(0, 300),
        related_service_request_id: i.serviceRequestId ?? null,
        related_need_id: i.needId ?? null,
      })),
    });
  }

  /** HU-62.2: la bandeja del perfil activo, de la más reciente a la más antigua, con su estado de lectura. */
  async list(user: AuthUser) {

    const rows = await this.prisma.notifications.findMany({
      where: this.mine(user),
      orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
      take: NOTIFICATIONS_LIMIT,
      select: LIST_SELECT,
    });

    return rows.map((n) => {
      const view = NOTIFICATION_VIEW[n.notification_types.type_name as NotificationTypeName];

      return {
        id: String(n.notification_id),
        tipo: view?.tipo ?? 'contratacion',
        titulo: view?.titulo ?? 'Novedad en Confiance',
        mensaje: n.message,
        fecha: n.created_at.toISOString(),
        leida: n.is_read,
        contratacionId: n.related_service_request_id === null ? null : String(n.related_service_request_id),
        necesidadId: n.related_need_id === null ? null : String(n.related_need_id),
      };
    });
  }

  /** HU-62.3: marca una notificación propia como leída o no leída. La de otra persona no existe (404). */
  async setRead(userId: bigint, notificationId: bigint, read: boolean) {

    const { count } = await this.prisma.notifications.updateMany({
      where: { notification_id: notificationId, user_id: userId },
      data: { is_read: read },
    });

    if (!count) throw apiError(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND', 'La notificación no existe.');

    return { id: String(notificationId), leida: read };
  }

  /** HU-62.3: marca como leídas todas las del perfil activo. */
  async readAll(user: AuthUser) {

    const { count } = await this.prisma.notifications.updateMany({
      where: { AND: [this.mine(user), { is_read: false }] },
      data: { is_read: true },
    });

    return { actualizadas: count };
  }

  /**
   * Las del usuario que corresponden a su perfil activo: las de una contratación según su lado (cliente o
   * prestador), las de una necesidad según si es suya (cliente) o de otro (prestador interesado), y las de la
   * cuenta en los dos perfiles, salvo las que solo aplican al prestador (verificación).
   */
  private mine(user: AuthUser): Prisma.notificationsWhereInput {

    const asClient = user.activeProfile === 'client';
    const account: Prisma.notificationsWhereInput = {
      related_service_request_id: null,
      related_need_id: null,
      ...(asClient && { notification_types: { type_name: { notIn: PROVIDER_ONLY_TYPES } } }),
    };

    return {
      user_id: user.userId,
      OR: asClient
        ? [
          { service_requests: { client_id: user.userId } },
          { related_service_request_id: null, needs: { client_id: user.userId } },
          account,
        ]
        : [
          { service_requests: { provider_profiles: { user_id: user.userId } } },
          { related_service_request_id: null, needs: { client_id: { not: user.userId } } },
          account,
        ],
    };
  }
}
