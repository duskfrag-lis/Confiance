import { NIT_DV_MESSAGE, NIT_MESSAGE, nitError, toNit } from './auth-forms';

describe('NIT', () => {
  it('es opcional: vacío no es error', () => {
    expect(nitError('')).toBeNull();
  });

  it.each(['900123456-8', '9001234568', '1063285296-6', '800197268-4', '860034313-7'])('acepta %s', (nit) => {
    expect(nitError(nit)).toBeNull();
  });

  it('rechaza un formato que no es NIT', () => {
    expect(nitError('12345-6')).toBe(NIT_MESSAGE);
  });

  it('rechaza un dígito de verificación que no coincide con el de la DIAN', () => {
    expect(nitError('900123456-7')).toBe(NIT_DV_MESSAGE);
    expect(nitError('1063285296-0')).toBe(NIT_DV_MESSAGE);
  });

  it('envía siempre el formato base-dígito', () => {
    expect(toNit('10632852966')).toBe('1063285296-6');
    expect(toNit('')).toBeNull();
  });
});
