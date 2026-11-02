import { BadRequestException } from '@nestjs/common';
import { ProviderAvailabilityDto } from '../../modules/profiles/dto/profiles.dto';
import { NeedDto } from '../../modules/publications/dto/publications.dto';
import { appValidationPipe } from './validation.pipe';

const messagesFor = async (metatype: new () => object, value: unknown) => {

  try {

    await appValidationPipe().transform(value, { type: 'body', metatype });
    return [];
  } catch (err) {

    return (err as BadRequestException).getResponse() as { message: string[] };
  }
};

describe('appValidationPipe', () => {
  it('un mensaje por campo: el del decorador escrito más arriba (obligatorio antes que la longitud)', async () => {
    const { message } = (await messagesFor(NeedDto, {})) as { message: string[] };

    expect(message).toEqual([
      'Escribe el título de la necesidad.',
      'Describe lo que necesitas.',
      'Elige un oficio del catálogo.',
      'Elige un barrio del catálogo.',
      'Escribe la dirección exacta.',
      'Elige una fecha y hora válidas.',
      'El presupuesto mínimo debe ser un valor en pesos, sin decimales.',
      'El presupuesto máximo debe ser un valor en pesos, sin decimales.',
    ]);
  });

  it('si solo falla la longitud, ese es el mensaje', async () => {
    const { message } = (await messagesFor(NeedDto, {
      titulo: 'x'.repeat(151), descripcion: 'd', oficioId: '4', barrioId: '3', direccion: 'Calle 1',
      fechaPreferida: '2026-12-01T10:00:00-05:00', presupuestoMin: 1, presupuestoMax: 2,
    })) as { message: string[] };

    expect(message).toEqual(['El título puede tener máximo 150 caracteres.']);
  });

  it('incluye los errores de objetos anidados y los campos que sobran', async () => {
    const { message } = (await messagesFor(ProviderAvailabilityDto, { franjas: [{ dia: 'lunes', bloque: 'madrugada' }], extra: 1 })) as {
      message: string[];
    };

    expect(message).toEqual(['property extra should not exist', 'Bloque inválido: usa mañana, tarde o noche.']);
  });
});
