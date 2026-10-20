import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchService, normalizeText } from './search.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('E4 SearchService', () => {
  let prisma: any;
  let catalog: any;
  let service: SearchService;

  // Texto SQL y valores de la consulta de la página (la segunda llamada a $queryRaw)
  const pageQuery = () => {
    const [strings, ...values] = prisma.$queryRaw.mock.calls[1];
    const query = Prisma.sql(strings, ...values);
    return { sql: query.sql, values: query.values };
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValueOnce([{ id: 8n }, { id: 3n }]),
    };
    catalog = { cards: jest.fn().mockResolvedValue([{ id: '8' }, { id: '3' }]) };
    service = new SearchService(prisma, catalog);
  });

  it('normaliza sin tildes ni mayúsculas (también la ñ)', () => {
    expect(normalizeText('Instalación ELÉCTRICA Peña')).toBe('instalacion electrica pena');
  });

  it('devuelve las tarjetas del catálogo en el orden de relevancia', async () => {
    const result = await service.search({ q: 'Fuga' });

    expect(catalog.cards).toHaveBeenCalledWith([8n, 3n]);
    expect(result).toEqual({ total: 2, pagina: 1, tamano: 20, resultados: [{ id: '8' }, { id: '3' }], sugerencia: null });
  });

  it('sin resultados sugiere publicar una necesidad (HU-32.3)', async () => {
    prisma.$queryRaw = jest.fn().mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([]);
    catalog.cards.mockResolvedValue([]);

    await expect(service.search({ q: 'xyz' })).resolves.toMatchObject({ total: 0, resultados: [], sugerencia: 'publicar_necesidad' });
  });

  it('busca cada palabra normalizada (máximo 5) y ordena primero por coincidencias en el título', async () => {
    await service.search({ q: '  Fuga  COCINA uno dos tres cuatro ' });

    const { sql, values } = pageQuery();
    expect(values).toEqual(expect.arrayContaining(['fuga', 'cocina', 'uno', 'dos', 'tres']));
    expect(values).not.toContain('cuatro');
    expect(sql).toMatch(/ORDER BY[\s\S]*DESC,vp\.avg_rating DESC, sl\.created_at DESC/);
  });

  it('sin texto ordena por calificación (no deja un ORDER BY 0)', async () => {
    await service.search({ categoriaId: '1' });
    expect(pageQuery().sql).toMatch(/ORDER BY vp\.avg_rating DESC/);
  });

  it('combina los filtros', async () => {
    await service.search({
      categoriaId: '1', comunaId: '2', precioMin: 1000, precioMax: 5000, calificacionMin: 4, soloVerificados: true, fecha: '2999-01-04',
    });

    const { sql, values } = pageQuery();
    expect(sql).toContain('c.parent_category_id');
    expect(sql).toContain('n.commune_id');
    expect(sql).toContain('sl.max_price >=');
    expect(sql).toContain('sl.min_price <=');
    expect(sql).toContain('vp.avg_rating >=');
    expect(sql).toContain('vp.identity_verified');
    expect(sql).toContain('fn_provider_slot_taken');
    expect(values).toEqual(expect.arrayContaining([1, 2, 1000, 5000, 4, '2999-01-04']));
  });

  it('rechaza un rango de precio invertido y una fecha pasada', async () => {
    expect(await codeOf(service.search({ precioMin: 5000, precioMax: 1000 }))).toBe('PRICE_RANGE');
    expect(await codeOf(service.search({ fecha: '2020-01-01' }))).toBe('PAST_DATE');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
