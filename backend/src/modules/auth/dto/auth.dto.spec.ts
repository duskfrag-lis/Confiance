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
    ['900123456-7', '900123456-7'],
    ['9001234567', '900123456-7'],
    [' 900123456 - 7 ', '900123456-7'],
  ])('normaliza %p a un solo formato', async (input, expected) => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit: input });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nit).toBe(expected);
  });

  it('trata el NIT vacío como no enviado', async () => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit: '' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nit).toBeNull();
  });

  it('rechaza formatos inválidos', async () => {
    const dto = plainToInstance(RegisterProviderDto, { ...provider, nit: '12345-6' });

    expect(await validate(dto)).toHaveLength(1);
  });

  it('el registro social normaliza igual', async () => {
    const dto = plainToInstance(CompleteSocialDto, { ...provider, rol: 'prestador', nit: '9001234567' });

    expect(dto.nit).toBe('900123456-7');
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
