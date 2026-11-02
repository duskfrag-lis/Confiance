import { createHash } from 'node:crypto';
import { WompiClient } from './wompi.client';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('HU-43 WompiClient', () => {
  const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
  const keys = {
    WOMPI_ENV: 'sandbox',
    WOMPI_PUBLIC_KEY: 'pub_test_x',
    WOMPI_PRIVATE_KEY: 'prv_test_x',
    WOMPI_INTEGRITY_SECRET: 'test_integrity_secreto',
    WOMPI_EVENTS_SECRET: 'test_events_secreto',
  };
  const client = new WompiClient(config(keys));

  it('sin las cuatro llaves, el PSE no está disponible', () => {
    expect(client.enabled).toBe(true);
    expect(new WompiClient(config({ ...keys, WOMPI_EVENTS_SECRET: '' })).enabled).toBe(false);
  });

  it('firma de integridad: referencia + centavos + COP + secreto', () => {
    expect(client.integritySignature('CONF-30-ab', 8_000_000)).toBe(sha256('CONF-30-ab8000000COPtest_integrity_secreto'));
  });

  describe('eventos', () => {
    const transaction = { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4490000, reference: 'CONF-1-a' };
    const event = (checksum: string, properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']) => ({
      event: 'transaction.updated',
      environment: 'test',
      data: { transaction },
      signature: { properties, checksum },
      timestamp: 1530291411,
    }) as any;
    const valid = sha256('1234-1610641025-49201APPROVED44900001530291411test_events_secreto');

    it('acepta la firma calculada con las propiedades que trae el evento, el timestamp y el secreto', () => {
      expect(client.isAuthentic(event(valid))).toBe(true);
      expect(client.isAuthentic(event(valid.toUpperCase()))).toBe(true);
      expect(client.isAuthentic(event(sha256('1234-1610641025-49201APPROVED1530291411test_events_secreto'), ['transaction.id', 'transaction.status'])))
        .toBe(true);
    });

    it('rechaza una firma alterada, sin firma o con el monto cambiado', () => {
      expect(client.isAuthentic(event('0'.repeat(64)))).toBe(false);
      expect(client.isAuthentic({ ...event(valid), signature: undefined })).toBe(false);
      expect(client.isAuthentic({ ...event(valid), data: { transaction: { ...transaction, amount_in_cents: 100 } } })).toBe(false);
    });
  });
});
