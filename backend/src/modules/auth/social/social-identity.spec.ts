import { parseReturnPath } from './social-identity';

describe('parseReturnPath', () => {
  it.each(['/cliente', '/prestador/contrataciones/12?tab=chat', '/'])('acepta la ruta interna %s', (path) => {
    expect(parseReturnPath(path)).toBe(path);
  });

  it.each([
    ['otro dominio', '//otro.com'],
    ['barra invertida', '/\\otro.com'],
    ['URL absoluta', 'https://otro.com'],
    ['ruta relativa', 'cliente'],
    ['vacía', ''],
    ['no es texto', ['/cliente']],
    ['demasiado larga', '/' + 'a'.repeat(600)],
  ])('rechaza %s', (_name, value) => {
    expect(parseReturnPath(value)).toBeNull();
  });
});
