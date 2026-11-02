import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  completedNotices, dbRuleTranslator, fullName, lockRequest, requestState, stateOf, summaryOf, titleOf,
} from '../contracting/contract-tx';
import { PAYMENT_METHODS, type PaymentState } from '../contracting/contracting.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { TRANSFER_NOT_RECEIVED_REASON } from './payments.constants';

const paymentDone = () => apiError(HttpStatus.CONFLICT, 'PAYMENT_DONE', 'Esta contratación ya está pagada.');

const paymentInProgress = () =>
  apiError(HttpStatus.CONFLICT, 'PAYMENT_IN_PROGRESS', 'Ya hay un pago en curso para esta contratación.');

const noBankAccount = () =>
  apiError(HttpStatus.CONFLICT, 'NO_BANK_ACCOUNT', 'El prestador no registró una cuenta bancaria; paga por PSE.');

export const translatePaymentRule = dbRuleTranslator([
  ['Solo se paga una contratación FINALIZADA', requestState],
  ['La contratación ya está pagada', paymentDone],
  ['Ya hay un pago en curso', paymentInProgress],
  ['El prestador no tiene información bancaria', noBankAccount],
]);

const PERSON = { first_name: true, last_name: true, profile_photo_url: true } satisfies Prisma.usersSelect;

/**
 * E9 · Pagos desde FINALIZADO (HU-43 a HU-45). Las reglas (monto, un intento abierto, un solo pago PAGADO, cuenta
 * bancaria para transferir) y el paso a COMPLETADO al quedar pagado están en la base; aquí se revisa quién y cuándo, y
 * se avisa en la misma transacción.
 */
@Injectable()
export class PaymentsService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  // HU-44 transferencia

  /** HU-44.2: el cliente marca que ya transfirió; el intento queda pendiente de confirmación y se avisa al prestador. */
  async markTransfer(userId: bigint, requestId: bigint) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'client');

      if (request.request_statuses.status_name !== 'finalizado') throw requestState();

      await tx.payments.create({
        data: {
          service_requests: { connect: { service_request_id: requestId } },
          amount: request.agreed_price,
          payment_methods: { connect: { method_name: 'bank_transfer' } },
          payment_statuses: { connect: { status_name: 'pending_confirmation' } },
        },
      });

      await this.notifications.notify([{
        userId: request.provider_profiles.user_id,
        type: 'transfer_marked',
        message: `${fullName(request.users)} marcó como hecha la transferencia de "${titleOf(request)}". `
          + 'Revisa tu cuenta y confirma si llegó.',
        serviceRequestId: requestId,
      }], tx);

      return summaryOf(request, 'finalizado');
    }).catch((err) => { throw translatePaymentRule(err); });
  }

  /**
   * HU-44.3 y HU-44.4: el prestador confirma si la transferencia llegó. Si llegó, el pago queda PAGADO y, con la
   * finalización ya confirmada, la base completa la contratación. Si no llegó, el cliente puede volver a pagar o
   * reclamar (HU-54).
   */
  async confirmTransfer(userId: bigint, requestId: bigint, received: boolean) {

    return this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'provider');

      const marked = await tx.payments.findFirst({
        where: { service_request_id: requestId, payment_statuses: { status_name: 'pending_confirmation' } },
        select: { payment_id: true },
      });

      if (request.request_statuses.status_name !== 'finalizado' || !marked) throw requestState();

      await tx.payments.update({
        where: { payment_id: marked.payment_id },
        data: {
          payment_statuses: { connect: { status_name: received ? 'paid' : 'rejected' } },
          failure_reason: received ? null : TRANSFER_NOT_RECEIVED_REASON,
        },
      });

      const state = await stateOf(tx, requestId);
      const title = titleOf(request);
      const provider = fullName(request.provider_profiles.users);

      await this.notifications.notify(received
        ? [
            {
              userId: request.client_id,
              type: 'transfer_confirmed',
              message: `${provider} confirmó que recibió la transferencia de "${title}".`,
              serviceRequestId: requestId,
            },
            ...(state === 'completado' ? completedNotices(request) : []),
          ]
        : [{
            userId: request.client_id,
            type: 'transfer_not_received',
            message: `${provider} indicó que la transferencia de "${title}" no llegó. Revisa con tu banco y vuelve a pagar, `
              + 'o abre un reclamo si ya se descontó.',
            serviceRequestId: requestId,
          }], tx);

      return summaryOf(request, state);
    }).catch((err) => { throw translatePaymentRule(err); });
  }

  //  HU-45 consulta

  /** HU-45: el pago de cada contratación propia desde FINALIZADO, como cliente o como prestador, el más reciente primero. */
  async mine(userId: bigint) {

    const rows = await this.prisma.service_requests.findMany({
      where: {
        request_statuses: { status_name: { in: ['finalizado', 'completado'] } },
        OR: [{ client_id: userId }, { provider_profiles: { user_id: userId } }],
      },
      select: {
        service_request_id: true,
        client_id: true,
        agreed_price: true,
        proposed_datetime: true,
        completion_requested_at: true,
        users: { select: PERSON },
        provider_profiles: { select: { users: { select: PERSON } } },
        service_listings: { select: { title: true } },
        needs: { select: { title: true } },
        payments: {
          select: {
            paid_at: true,
            payment_statuses: { select: { status_name: true } },
            payment_methods: { select: { method_name: true } },
          },
        },
      },
    });

    return rows
      .map((r) => {

        const has = (status: string) => r.payments.find((p) => p.payment_statuses.status_name === status);
        const paid = has('paid');
        const marked = has('pending_confirmation');
        const open = has('pending');
        const current = paid ?? marked ?? open;
        const other = r.client_id === userId ? r.provider_profiles.users : r.users;

        return {
          contratacionId: String(r.service_request_id),
          servicio: r.service_listings?.title ?? r.needs?.title ?? 'Servicio',
          contraparte: { nombre: fullName(other), fotoUrl: this.storage.publicUrl(other.profile_photo_url) },
          monto: Number(r.agreed_price),
          estado: (paid ? 'pagado' : marked ? 'pendiente_confirmacion' : open ? 'en_proceso' : 'pendiente') satisfies PaymentState,
          metodo: current ? PAYMENT_METHODS[current.payment_methods.method_name] ?? null : null,
          finalizada: (r.completion_requested_at ?? r.proposed_datetime).toISOString(),
          fecha: paid?.paid_at?.toISOString() ?? null,
          intentosRechazados: r.payments.filter((p) => p.payment_statuses.status_name === 'rejected').length,
        };
      })
      .sort((a, b) => (b.fecha ?? b.finalizada).localeCompare(a.fecha ?? a.finalizada));
  }
}
