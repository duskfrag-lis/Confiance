import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema, validateEnv } from './env.validation';

describe('.env.example', () => {
  const keys = readFileSync(join(__dirname, '../../.env.example'), 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=/.exec(line.trim())?.[1])
    .filter((key): key is string => Boolean(key));

  it('no repite variables', () => {
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('incluye todas las variables que valida env.validation', () => {
    expect(Object.keys(envSchema.shape).filter((key) => !keys.includes(key))).toEqual([]);
  });
});

describe('env.validation', () => {
  const base = Object.fromEntries(
    readFileSync(join(__dirname, '../../.env.example'), 'utf8')
      .split('\n')
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map(([, key, value]) => [key, value.replace(/^"|"$/g, '')]),
  );
  base.JWT_ACCESS_SECRET = 'secreto-de-prueba-acceso';
  base.JWT_REFRESH_SECRET = 'secreto-de-prueba-refresh';
  const TEST_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

  it('no arranca en producción con la clave de prueba de reCAPTCHA', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', RECAPTCHA_SECRET_KEY: TEST_KEY })).toThrow(/clave de prueba/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', RECAPTCHA_SECRET_KEY: 'clave-real' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'development', RECAPTCHA_SECRET_KEY: TEST_KEY })).not.toThrow();
  });

  it('las llaves de Wompi deben ser del ambiente elegido', () => {
    expect(() => validateEnv(base)).not.toThrow();
    expect(() => validateEnv({ ...base, WOMPI_PUBLIC_KEY: 'pub_test_abc', WOMPI_EVENTS_SECRET: 'test_events_abc' })).not.toThrow();
    expect(() => validateEnv({ ...base, WOMPI_PUBLIC_KEY: 'pub_prod_abc' })).toThrow(/pub_test_/);
    expect(() => validateEnv({ ...base, WOMPI_ENV: 'production', WOMPI_INTEGRITY_SECRET: 'test_integrity_abc' })).toThrow(/prod_integrity_/);
  });
});
