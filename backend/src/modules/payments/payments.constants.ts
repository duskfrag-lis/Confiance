/** Motivo que queda en el intento cuando el prestador dice que la transferencia no llegó (HU-44.4). */
export const TRANSFER_NOT_RECEIVED_REASON = 'El prestador indicó que la transferencia no llegó.';

/** HU-43: API de Wompi por ambiente (las llaves deben ser del mismo, ver env.validation). */
export const WOMPI_API_URL = { sandbox: 'https://sandbox.wompi.co/v1', production: 'https://production.wompi.co/v1' } as const;

/** Espera máxima por cada llamada a Wompi. */
export const WOMPI_TIMEOUT_MS = 10_000;

/** Tras crear la transacción, cuántas veces y cada cuánto se consulta hasta que Wompi entrega la URL del banco. */
export const PSE_URL_POLLS = 8;
export const PSE_URL_POLL_MS = 1_000;

/** Barrido de los PSE abiertos (por si el evento de Wompi no llega, p. ej. en local): cada 5 minutos. */
export const PSE_SYNC_CRON = '*/5 * * * *';

/** Un PSE se consulta en el barrido después de este tiempo; sin transacción en Wompi, se da por fallido después del segundo. */
export const PSE_SYNC_AFTER_MS = 2 * 60_000;
export const PSE_ABANDON_AFTER_MS = 15 * 60_000;

/** La lista de bancos de PSE cambia poco: se guardan en memoria este tiempo. */
export const WOMPI_CACHE_MS = 60 * 60_000;

/** Tipos de documento que acepta PSE para el pagador. */
export const PSE_DOCUMENT_TYPES = ['CC', 'CE', 'NIT', 'PP', 'TI'] as const;
export type PseDocumentType = (typeof PSE_DOCUMENT_TYPES)[number];
