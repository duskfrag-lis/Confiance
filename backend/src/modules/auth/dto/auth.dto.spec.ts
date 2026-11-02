import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteSocialDto } from '../social/dto/complete-social.dto';
import { RegisterProviderDto } from './auth.dto';

const provider = {
  nombres: 'Pedro',
  apellidos: 'Pérez',
  cedula: '55555555',
  telefono: '3111111111',
  email: 'pedro@correo.com',
  password: 'Prueba123!',
  aceptaTerminos: true,
  captchaToken: 'ok',
  oficios: ['1'],
};

describe('NIT (D-09)', () => {
  it.each([
    ['900123456-8', '900123456-8'],
    ['9001234568', '900123456-8'],
    [' 900123456 - 8 ', '900123456-8'],
    ['1063285296-6', '1063285296-6'],
    ['10632852966', '1063285296-6'],
    ['52123456-2', '52123456-2'],
  ])('normaliza %p a un solo formato', async (input, expected) => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit: input });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nit).toBe(expected);
  });

  it('trata el NIT vacío como no enviado: es opcional', async () => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit: '' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nit).toBeNull();
  });

  it.each(['12345-6', '12345678901-2', '90012345a-8'])('rechaza el formato %p', async (nit) => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit });

    expect(await validate(dto)).toHaveLength(1);
  });

  it('rechaza un dígito de verificación que no coincide con el de la DIAN', async () => {
    const errors = await validate(plainToInstance(RegisterProviderDto, { ...provider, nit: '900123456-7' }));

    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual([
      'El dígito de verificación no coincide. Revisa el NIT en tu RUT.',
    ]);
  });

  it.each([
    ['DIAN', '800197268-4'],
    ['Bancolombia', '860034313-7'],
    ['Ecopetrol', '899999068-1'],
  ])('acepta el NIT real de %s', async (_name, nit) => {
    expect(await validate(plainToInstance(RegisterProviderDto, { ...provider, nit }))).toHaveLength(0);
  });

  it('el registro social normaliza y valida igual', async () => {
    const dto = plainToInstance(CompleteSocialDto, { ...provider, rol: 'prestador', nit: '9001234568' });

    expect(dto.nit).toBe('900123456-8');
    expect(await validate(plainToInstance(CompleteSocialDto, { ...provider, rol: 'prestador', nit: '9001234567' }))).not.toHaveLength(0);
  });
});

describe('mensajes de validación', () => {
  const messages = async (data: object) =>
    (await validate(plainToInstance(RegisterProviderDto, data))).flatMap((e) => Object.values(e.constraints ?? {}));

  it('responden en español', async () => {
    const result = await messages({ ...provider, nombres: '  ', captchaToken: '', oficios: ['1', '1'] });

    expect(result).toEqual(
      expect.arrayContaining(['Ingresa tus nombres.', 'Completa la verificación reCAPTCHA.', 'No repitas oficios.']),
    );
    expect(result.join(' ')).not.toMatch(/should|must/);
  });
});
