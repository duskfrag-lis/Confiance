import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REQUEST_SELECT, completedNotices, formatCop, fullName, lockRequest, requestState, stateOf, titleOf,
} from '../contracting/contract-tx';
import { NotificationsService } from '../notifications/notifications.service';
import type { StartPseDto } from './dto/payments.dto';
import {
  PSE_ABANDON_AFTER_MS, PSE_SYNC_AFTER_MS, PSE_URL_POLL_MS, PSE_URL_POLLS,
} from './payments.constants';
import { translatePaymentRule } from './payments.service';
import { WompiClient, WompiError, type WompiEvent, type WompiTransaction } from './wompi.client';

const unavailable = () =>
  apiError(HttpStatus.SERVICE_UNAVAILABLE, 'PAYMENTS_UNAVAILABLE', 'El pago por PSE no está disponible en este momento. Intenta más tarde o paga por transferencia.');

const gatewayRejected = () =>
  apiError(HttpStatus.UNPROCESSABLE_ENTITY, 'PAYMENT_GATEWAY', 'Wompi no aceptó los datos del pago. Revisa el banco y el documento.');

/** Resultado de un intento en el vocabulario de la API (HU-45). */
type AttemptResult = 'pendiente' | 'pagado' | 'rechazado';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HU-43: pago por PSE con Wompi. El intento nace en `pending` con una referencia única; Wompi lo resuelve y el
 * resultado llega por el evento firmado (webhook) o porque se consulta la transacción (al volver del banco y en el
 * barrido). Las dos vías pasan por `apply`, que es idempotente: un evento repetido no cambia nada.
 */
@Injectable()
export class PseService {

  private readonly logger = new Logger(PseService.name);

  constructor(
    private prisma: PrismaService,
    private wompi: WompiClient,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  // datos para el formulario

  async banks() {

    if (!this.wompi.enabled) throw unavailable();

    return this.wompi.banks().catch(() => { throw unavailable(); });
  }

  /** Enlaces a los dos documentos de Wompi que el cliente debe aceptar antes de pagar. */
  async terms() {

    if (!this.wompi.enabled) throw unavailable();

    const t = await this.wompi.terms().catch(() => { throw unavailable(); });

    return { terminosUrl: t.termsUrl, datosPersonalesUrl: t.personalDataUrl };
  }

  //  HU-43.2 iniciar

  /**
   * Crea el intento y la transacción en Wompi y devuelve la URL del banco. Si Wompi rechaza los datos o no
   * responde, el intento queda rechazado para que el cliente pueda volver a intentar.
   */
  async start(userId: bigint, requestId: bigint, dto: StartPseDto) {

    if (!this.wompi.enabled) throw unavailable();

    const terms = await this.wompi.terms().catch(() => { throw unavailable(); });
    const reference = `CONF-${requestId}-${randomBytes(6).toString('hex')}`;

    const { payment, request, client } = await this.prisma.$transaction(async (tx) => {

      const { request } = await lockRequest(tx, userId, requestId, 'client');

      if (request.request_statuses.status_name !== 'finalizado') throw requestState();

      const payment = await tx.payments.create({
        data: {
          service_requests: { connect: { service_request_id: requestId } },
          amount: request.agreed_price,
          gateway_reference: reference,
          payment_methods: { connect: { method_name: 'pse' } },
          payment_statuses: { connect: { status_name: 'pending' } },
        },
        select: { payment_id: true },
      });

      const client = await tx.users.findUniqueOrThrow({
        where: { user_id: userId },
        select: { email: true, phone: true, first_name: true, last_name: true },
      });

      return { payment, request, client };
    }).catch((err) => { throw translatePaymentRule(err); });

    let transaction: WompiTransaction;

    try {

      transaction = await this.wompi.createPse({
        reference,
        amountInCents: Math.round(Number(request.agreed_price) * 100),
        email: client.email,
        fullName: fullName(client),
        phone: client.phone,
        bankCode: dto.banco,
        personType: dto.tipoPersona === 'natural' ? 0 : 1,
        documentType: dto.tipoDocumento,
        document: dto.documento,
        description: `Confiance: ${titleOf(request)}`,
        redirectUrl: `${this.config.get('FRONTEND_URL')}/cliente/contrataciones/${requestId}?pago=pse`,
        terms,
      });
    } catch (err) {

      await this.reject(payment.payment_id, 'No se pudo iniciar el pago en Wompi.');
      throw err instanceof WompiError && err.status < 500 ? gatewayRejected() : unavailable();
    }

    await this.prisma.payments.update({
      where: { payment_id: payment.payment_id },
      data: { gateway_transaction_id: transaction.id },
    });

    // Wompi entrega la URL del banco unos instantes después de crear la transacción
    for (let i = 0; i < PSE_URL_POLLS; i++) {

      const url = transaction.payment_method?.extra?.async_payment_url;

      if (url) return { url, estado: 'pendiente' as AttemptResult };
      if (transaction.status !== 'PENDING') return { url: null, estado: await this.apply(transaction) };

      await sleep(PSE_URL_POLL_MS);
      transaction = await this.wompi.transaction(transaction.id).catch(() => transaction);
    }

    // Sin URL todavía: el barrido lo resolverá; la interfaz muestra el pago en proceso
    return { url: null, estado: 'pendiente' as AttemptResult };
  }

  //resultado

  /** Al volver del banco: consulta en Wompi el PSE abierto de la contratación (cliente o prestador). */
  async sync(userId: bigint, requestId: bigint): Promise<{ estado: AttemptResult | null }> {

    const open = await this.prisma.$transaction(async (tx) => {

      await lockRequest(tx, userId, requestId);

      return tx.payments.findFirst({
        where: { service_request_id: requestId, payment_statuses: { status_name: 'pending' }, gateway_transaction_id: { not: null } },
        select: { gateway_transaction_id: true },
      });
    });

    if (!open) return { estado: null };

    const transaction = await this.wompi.transaction(open.gateway_transaction_id!).catch(() => null);

    return { estado: transaction ? await this.apply(transaction) : 'pendiente' };
  }

  /** HU-43.3: evento `transaction.updated` de Wompi. Solo se aplica si la firma y el ambiente son los esperados. */
  async handleEvent(event: WompiEvent) {

    if (!this.wompi.isAuthentic(event)) return { aplicado: false, motivo: 'firma' };
    if (event.environment !== this.wompi.environment) return { aplicado: false, motivo: 'ambiente' };
    if (event.event !== 'transaction.updated' || !event.data?.transaction) return { aplicado: false, motivo: 'evento' };

    await this.apply(event.data.transaction);

    return { aplicado: true };
  }

  /**
   * Barrido: consulta los PSE abiertos que ya tuvieron tiempo de resolverse y da por fallidos los que nunca llegaron a
   * Wompi. Devuelve cuántos cambiaron.
   */
  async syncPending() {

    const now = Date.now();
    const open = await this.prisma.payments.findMany({
      where: {
        payment_methods: { method_name: 'pse' },
        payment_statuses: { status_name: 'pending' },
        created_at: { lte: new Date(now - PSE_SYNC_AFTER_MS) },
      },
      select: { payment_id: true, gateway_transaction_id: true, created_at: true },
    });

    let changed = 0;

    for (const p of open) {

      if (!p.gateway_transaction_id) {

        if (now - p.created_at.getTime() >= PSE_ABANDON_AFTER_MS) {
          await this.reject(p.payment_id, 'El pago no llegó a iniciarse en Wompi.');
          changed++;
        }
        continue;
      }

      const transaction = await this.wompi.transaction(p.gateway_transaction_id).catch(() => null);
      if (transaction && (await this.apply(transaction)) !== 'pendiente') changed++;
    }

    return changed;
  }

  //  auxiliares

  /**
   * Aplica el estado de una transacción a su intento (por la referencia). Solo cambia un intento `pending`: si ya se
   * resolvió, devuelve lo que quedó. Un monto distinto al acordado no se da por pagado.
   */
  async apply(t: WompiTransaction): Promise<AttemptResult> {

    const result = await this.prisma.$transaction(async (tx) => {

      const rows = await tx.$queryRaw<{ payment_id: bigint }[]>`
        SELECT payment_id FROM payments WHERE gateway_reference = ${t.reference} FOR UPDATE`;

      if (!rows.length) return null;

      const payment = await tx.payments.findUniqueOrThrow({
        where: { payment_id: rows[0].payment_id },
        select: {
          payment_id: true, amount: true, gateway_transaction_id: true, service_request_id: true,
          payment_statuses: { select: { status_name: true } },
        },
      });

      const current = payment.payment_statuses.status_name;

      if (current !== 'pending') return { state: current === 'paid' ? 'pagado' : 'rechazado', notify: null } as const;
      if (t.status === 'PENDING') return { state: 'pendiente', notify: null } as const;

      const amountMatches = t.amount_in_cents === Math.round(Number(payment.amount) * 100);
      const approved = t.status === 'APPROVED' && amountMatches;

      if (t.status === 'APPROVED' && !amountMatches) {
        this.logger.error(`Wompi aprobó ${t.reference} por ${t.amount_in_cents} centavos; se esperaba ${payment.amount}.`);
      }

      await tx.payments.update({
        where: { payment_id: payment.payment_id },
        data: {
          gateway_transaction_id: payment.gateway_transaction_id ?? t.id,
          payment_statuses: { connect: { status_name: approved ? 'paid' : 'rejected' } },
          failure_reason: approved ? null : (t.status_message || (amountMatches ? `Wompi: ${t.status}` : 'El monto no coincide con el valor acordado.')).slice(0, 300),
        },
      });

      const request = await tx.service_requests.findUniqueOrThrow({
        where: { service_request_id: payment.service_request_id },
        select: REQUEST_SELECT,
      });
      const state = await stateOf(tx, payment.service_request_id);
      const title = titleOf(request);
      const amount = formatCop(Number(payment.amount));

      await this.notifications.notify(approved
        ? [
            {
              userId: request.client_id,
              type: 'payment_approved',
              message: `Tu pago de ${amount} por PSE para "${title}" fue aprobado.`,
              serviceRequestId: request.service_request_id,
            },
            {
              userId: request.provider_profiles.user_id,
              type: 'payment_approved',
              message: `${fullName(request.users)} pagó ${amount} por PSE por "${title}".`,
              serviceRequestId: request.service_request_id,
            },
            ...(state === 'completado' ? completedNotices(request) : []),
          ]
        : [{
            userId: request.client_id,
            type: 'payment_rejected',
            message: `Tu pago por PSE para "${title}" no se completó. Puedes intentarlo de nuevo o pagar por transferencia.`,
            serviceRequestId: request.service_request_id,
          }], tx);

      return { state: approved ? 'pagado' : 'rechazado' } as const;
    });

    return result?.state ?? 'rechazado';
  }

  /** Un intento que nunca llegó a Wompi (o que Wompi no aceptó) queda rechazado, si sigue abierto. */
  private async reject(paymentId: bigint, reason: string) {

    const rejected = await this.prisma.payment_statuses.findUniqueOrThrow({ where: { status_name: 'rejected' } });

    await this.prisma.payments.updateMany({
      where: { payment_id: paymentId, payment_statuses: { status_name: 'pending' } },
      data: { status_id: rejected.payment_status_id, failure_reason: reason },
    });
  }
}
