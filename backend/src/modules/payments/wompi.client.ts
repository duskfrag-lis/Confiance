import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WOMPI_API_URL, WOMPI_CACHE_MS, WOMPI_TIMEOUT_MS, type PseDocumentType } from './payments.constants';

/** Estado de una transacción en Wompi. APPROVED, DECLINED, ERROR y VOIDED son finales. */
export type WompiStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED';

export interface WompiTransaction {
  id: string;
  reference: string;
  status: WompiStatus;
  amount_in_cents: number;
  status_message?: string | null;
  payment_method?: { extra?: { async_payment_url?: string } };
}

export interface WompiTerms {
  acceptanceToken: string;
  personalDataToken: string;
  termsUrl: string;
  personalDataUrl: string;
}

export interface PseTransactionInput {
  reference: string;
  amountInCents: number;
  email: string;
  fullName: string;
  phone: string;
  bankCode: string;
  personType: 0 | 1;
  documentType: PseDocumentType;
  document: string;
  description: string;
  redirectUrl: string;
  terms: Pick<WompiTerms, 'acceptanceToken' | 'personalDataToken'>;
}

/** Wompi respondió con error (4xx: datos rechazados; 5xx o red: la pasarela no está disponible). */
export class WompiError extends Error {

  constructor(readonly status: number, message: string) {

    super(message);
  }
}

/**
 * HU-43: cliente HTTP de la API de Wompi (PSE). Las llaves nunca salen del servidor: la firma de integridad se
 * calcula aquí y los eventos se validan con el secreto de eventos.
 */
@Injectable()
export class WompiClient {

  private readonly logger = new Logger(WompiClient.name);
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly integritySecret: string;
  private readonly eventsSecret: string;
  readonly environment: 'test' | 'prod';
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(config: ConfigService) {

    const env = config.get<'sandbox' | 'production'>('WOMPI_ENV') ?? 'sandbox';
    this.baseUrl = WOMPI_API_URL[env];
    this.environment = env === 'sandbox' ? 'test' : 'prod';
    this.publicKey = config.get('WOMPI_PUBLIC_KEY') ?? '';
    this.privateKey = config.get('WOMPI_PRIVATE_KEY') ?? '';
    this.integritySecret = config.get('WOMPI_INTEGRITY_SECRET') ?? '';
    this.eventsSecret = config.get('WOMPI_EVENTS_SECRET') ?? '';
  }

  /** Sin las cuatro llaves no se ofrece PSE. */
  get enabled() {

    return Boolean(this.publicKey && this.privateKey && this.integritySecret && this.eventsSecret);
  }

  /** Términos de Wompi que el cliente acepta antes de pagar, con los tokens que exige la transacción. */
  /** Sin caché: los tokens de aceptación vencen. */
  async terms(): Promise<WompiTerms> {

    const { data } = await this.request<{
      data: {
        presigned_acceptance: { acceptance_token: string; permalink: string };
        presigned_personal_data_auth: { acceptance_token: string; permalink: string };
      };
    }>('GET', '/merchants/info', { headers: { 'x-merchant-public-key': this.publicKey } });

    return {
      acceptanceToken: data.presigned_acceptance.acceptance_token,
      personalDataToken: data.presigned_personal_data_auth.acceptance_token,
      termsUrl: data.presigned_acceptance.permalink,
      personalDataUrl: data.presigned_personal_data_auth.permalink,
    };
  }

  /** Bancos de PSE. El código 0 es el texto "seleccione su banco" de la lista de Wompi, no un banco. */
  banks(): Promise<{ codigo: string; nombre: string }[]> {

    return this.cached('banks', async () => {

      const { data } = await this.request<{ data: { financial_institution_code: string; financial_institution_name: string }[] }>(
        'GET', '/pse/financial_institutions', { key: this.publicKey },
      );

      return data
        .filter((b) => b.financial_institution_code !== '0')
        .map((b) => ({ codigo: b.financial_institution_code, nombre: b.financial_institution_name }));
    });
  }

  async createPse(input: PseTransactionInput): Promise<WompiTransaction> {

    const { data } = await this.request<{ data: WompiTransaction }>('POST', '/transactions', {
      key: this.privateKey,
      body: {
        acceptance_token: input.terms.acceptanceToken,
        accept_personal_auth: input.terms.personalDataToken,
        amount_in_cents: input.amountInCents,
        currency: 'COP',
        signature: this.integritySignature(input.reference, input.amountInCents),
        customer_email: input.email,
        reference: input.reference,
        redirect_url: input.redirectUrl,
        customer_data: { phone_number: `57${input.phone}`, full_name: input.fullName },
        payment_method: {
          type: 'PSE',
          user_type: input.personType,
          user_legal_id_type: input.documentType,
          user_legal_id: input.document,
          financial_institution_code: input.bankCode,
          payment_description: input.description.slice(0, 64),
        },
      },
    });

    return data;
  }

  async transaction(id: string): Promise<WompiTransaction> {

    const { data } = await this.request<{ data: WompiTransaction }>('GET', `/transactions/${encodeURIComponent(id)}`, { key: this.privateKey });

    return data;
  }

  /** Firma de integridad: SHA-256 de referencia + monto en centavos + moneda + secreto de integridad. */
  integritySignature(reference: string, amountInCents: number) {

    return sha256(`${reference}${amountInCents}COP${this.integritySecret}`);
  }

  /**
   * Valida un evento: SHA-256 de los valores de `signature.properties` (en su orden, leídos de `data`), el
   * `timestamp` y el secreto de eventos. Las propiedades se leen del evento porque Wompi puede cambiarlas.
   */
  isAuthentic(event: WompiEvent) {

    const properties = event?.signature?.properties;
    const checksum = event?.signature?.checksum;

    if (!this.eventsSecret || !Array.isArray(properties) || typeof checksum !== 'string' || event.timestamp == null) return false;

    const values = properties.map((path) => path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], event.data));
    const expected = Buffer.from(sha256(`${values.join('')}${event.timestamp}${this.eventsSecret}`));
    const received = Buffer.from(checksum.toLowerCase());

    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  // auxiliares

  private async request<T>(method: 'GET' | 'POST', path: string, opts: { key?: string; headers?: Record<string, string>; body?: unknown }): Promise<T> {

    let res: Response;

    try {

      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}),
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        signal: AbortSignal.timeout(WOMPI_TIMEOUT_MS),
      });
    } catch (err) {

      this.logger.error(`Wompi ${method} ${path}: sin respuesta`, err instanceof Error ? err.message : String(err));
      throw new WompiError(503, 'Wompi no respondió.');
    }

    const body = await res.json().catch(() => null);

    if (!res.ok) {

      // Wompi explica el rechazo en error.messages (por campo) o error.reason
      const detail = JSON.stringify(body?.error?.messages ?? body?.error?.reason ?? body);
      this.logger.warn(`Wompi ${method} ${path}: ${res.status} ${detail}`);
      throw new WompiError(res.status, detail);
    }

    return body as T;
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {

    const hit = this.cache.get(key);

    if (hit && Date.now() - hit.at < WOMPI_CACHE_MS) return hit.value as T;

    const value = await load();
    this.cache.set(key, { at: Date.now(), value });

    return value;
  }
}

export interface WompiEvent {
  event?: string;
  environment?: string;
  data?: { transaction?: WompiTransaction };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
