import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Tipos del catálogo notification_types que usa el backend (se buscan por nombre). */
export type NotificationType = 'interest_received' | 'interest_selected' | 'interest_not_selected';

export interface NewNotification {
  userId: bigint;
  type: NotificationType;
  /** Máximo 300 caracteres (columna message). */
  message: string;
  serviceRequestId?: bigint;
}

/**
 * Notificaciones dentro de la plataforma. Se guardan en la misma transacción que el cambio que las origina,
 * así nunca queda un aviso de algo que no pasó. Consultarlas y marcarlas como leídas es de la épica de
 * notificaciones.
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
      })),
    });
  }
}
