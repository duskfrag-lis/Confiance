import { parseDuration } from './session.service';

describe('parseDuration', () => {
  it('convierte las duraciones de JWT_*_EXPIRES', () => {
    expect(parseDuration('15m')).toBe(15 * 60_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('30s')).toBe(30_000);
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => parseDuration('1w')).toThrow();
  });
});
