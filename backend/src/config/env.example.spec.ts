import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './env.validation';

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
