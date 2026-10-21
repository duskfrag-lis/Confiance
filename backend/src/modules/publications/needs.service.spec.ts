import { HttpException, NotFoundException } from '@nestjs/common';
import { NeedsService } from './needs.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const photo = { buffer: Buffer.from('x'), size: 10 };
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
const dto = () => ({
  titulo: 'Cambio de breaker', descripcion: 'Se quemó anoche', oficioId: '4', barrioId: '3', direccion: 'Calle 10 # 5-20',
  fechaPreferida: tomorrow(), presupuestoMin: 40000, presupuestoMax: 90000,
});

const row = (status: string, photos: string[] = []) => ({
  need_id: 5n,
  title: 'Cambio de breaker',
  description: 'Se quemó anoche',
  exact_address: 'Calle 10 # 5-20',
  preferred_datetime: new Date('2026-10-27T00:00:00Z'),
  budget_min: '40000',
  budget_max: '90000',
  created_at: new Date('2026-10-19T12:00:00Z'),
  need_statuses: { status_name: status },
  categories: { category_id: 4, category_name: 'Instalaciones eléctricas' },
  neighborhoods: { neighborhood_id: 3, neighborhood_name: 'Sur', communes: { commune_id: 2, commune_name: 'Comuna 2' } },
  need_photos: photos.map((photo_url, i) => ({ need_photo_id: BigInt(i + 1), photo_url })),
});

describe('E3 NeedsService', () => {
  let prisma: any;
  let storage: any;
  let interests: any;
  let service: NeedsService;

  beforeEach(() => {
    prisma = {
      categories: { count: jest.fn().mockResolvedValue(1) },
      neighborhoods: { count: jest.fn().mockResolvedValue(1) },
      provider_categories: { findMany: jest.fn().mockResolvedValue([{ category_id: 4 }]) },
      need_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ need_status_id: { open: 1, provider_selected: 2, closed: 3 }[where.status_name as string] })),
      },
      needs: {
        create: jest.fn().mockResolvedValue(row('open', ['public/a.webp'])),
        findFirst: jest.fn().mockResolvedValue(row('open', ['public/a.webp'])),
        findMany: jest.fn().mockResolvedValue([row('open')]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      need_photos: { update: jest.fn() },
      service_requests: { findFirst: jest.fn().mockResolvedValue({ service_request_id: 30n }) },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    storage = {
      uploadPublicPhoto: jest.fn().mockResolvedValue('public/nueva.webp'),
      copyToWithdrawn: jest.fn((k: string) => Promise.resolve(k.replace('public/', 'withdrawn/'))),
      remove: jest.fn(),
      publicUrl: jest.fn((k: string) => (k.startsWith('public/') ? `http://api/media/${k.slice(7)}` : null)),
    };
    interests = { dismissPending: jest.fn() };
    service = new NeedsService(prisma, storage, interests);
  });

  describe('HU-26 publicar', () => {
    it('queda abierta, con la dirección exacta solo en la vista del dueño', async () => {
      const need = await service.create(9n, dto(), [photo]);

      expect(prisma.needs.create.mock.calls[0][0].data).toMatchObject({
        client_id: 9n, category_id: 4, neighborhood_id: 3, exact_address: 'Calle 10 # 5-20', status_id: 1,
        budget_min: 40000, budget_max: 90000, need_photos: { create: [{ photo_url: 'public/nueva.webp' }] },
      });
      expect(need).toMatchObject({ estado: 'abierta', direccion: 'Calle 10 # 5-20', acciones: ['cerrar'] });
    });

    it('el dueño ve marcada una abierta cuya fecha ya pasó (los prestadores ya no la ven)', async () => {
      prisma.needs.findFirst.mockResolvedValue({ ...row('open'), preferred_datetime: new Date(Date.now() - 60_000) });
      await expect(service.getOwn(9n, 5n)).resolves.toMatchObject({ estado: 'abierta', vencida: true });

      prisma.needs.findFirst.mockResolvedValue({ ...row('open'), preferred_datetime: new Date(Date.now() + 86_400_000) });
      await expect(service.getOwn(9n, 5n)).resolves.toMatchObject({ vencida: false });
    });

    it('con prestador elegido enlaza la solicitud vigente; abierta (o reabierta) no tiene', async () => {
      await expect(service.getOwn(9n, 5n)).resolves.toMatchObject({ solicitudId: null });
      expect(prisma.service_requests.findFirst).not.toHaveBeenCalled();

      prisma.needs.findFirst.mockResolvedValue(row('provider_selected'));
      await expect(service.getOwn(9n, 5n)).resolves.toMatchObject({ estado: 'prestador_seleccionado', solicitudId: '30' });
      expect(prisma.service_requests.findFirst.mock.calls[0][0]).toMatchObject({ where: { source_need_id: 5n }, orderBy: { created_at: 'desc' } });
    });

    it('las fotos son opcionales', async () => {
      await service.create(9n, dto(), undefined);
      expect(prisma.needs.create.mock.calls[0][0].data.need_photos).toEqual({ create: [] });
    });

    it('rechaza presupuesto invertido, fecha pasada, más de 5 fotos, oficio y barrio inválidos, sin subir nada', async () => {
      expect(await codeOf(service.create(9n, { ...dto(), presupuestoMax: 100 }, [photo]))).toBe('BUDGET_RANGE');
      expect(await codeOf(service.create(9n, { ...dto(), fechaPreferida: new Date(Date.now() - 60_000).toISOString() }, [photo]))).toBe('PAST_DATE');
      expect(await codeOf(service.create(9n, dto(), Array(6).fill(photo)))).toBe('NEED_PHOTOS');

      prisma.categories.count.mockResolvedValueOnce(0);
      expect(await codeOf(service.create(9n, dto(), [photo]))).toBe('INVALID_CATEGORY');

      prisma.neighborhoods.count.mockResolvedValueOnce(0);
      expect(await codeOf(service.create(9n, dto(), [photo]))).toBe('INVALID_ZONE');
      expect(prisma.neighborhoods.count.mock.calls[0][0].where).toEqual({ neighborhood_id: 3, is_active: true, communes: { is_active: true } });

      expect(storage.uploadPublicPhoto).not.toHaveBeenCalled();
    });

    it('si falla una foto, borra las que ya subió', async () => {
      storage.uploadPublicPhoto.mockResolvedValueOnce('public/1.webp').mockRejectedValueOnce(new Error('INVALID_IMAGE'));

      await expect(service.create(9n, dto(), [photo, photo])).rejects.toThrow('INVALID_IMAGE');
      expect(storage.remove).toHaveBeenCalledWith('public/1.webp');
    });
  });

  describe('HU-26.6 cerrar', () => {
    it('una ajena es 404', async () => {
      prisma.needs.findFirst.mockResolvedValue(null);
      await expect(service.close(9n, 5n)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.needs.findFirst.mock.calls[0][0].where).toEqual({ need_id: 5n, client_id: 9n });
    });

    it('la cierra solo si sigue abierta y sus fotos pasan a withdrawn/ (se conservan)', async () => {
      await service.close(9n, 5n);

      expect(prisma.needs.updateMany.mock.calls[0][0]).toEqual({
        where: { need_id: 5n, need_statuses: { status_name: 'open' } },
        data: { status_id: 3 },
      });
      expect(interests.dismissPending).toHaveBeenCalledWith(prisma, 5n, 'Cambio de breaker');
      expect(prisma.need_photos.update.mock.calls[0][0].data).toEqual({ photo_url: 'withdrawn/a.webp' });
      expect(storage.remove).toHaveBeenCalledWith('public/a.webp');
      expect(storage.remove).not.toHaveBeenCalledWith('withdrawn/a.webp');
    });

    it('si justo se seleccionó un prestador, gana la selección y borra las copias', async () => {
      prisma.needs.updateMany.mockResolvedValue({ count: 0 });

      expect(await codeOf(service.close(9n, 5n))).toBe('NEED_STATE');
      expect(interests.dismissPending).not.toHaveBeenCalled();
      expect(storage.remove).toHaveBeenCalledWith('withdrawn/a.webp');
      expect(storage.remove).not.toHaveBeenCalledWith('public/a.webp');
    });

    it('con prestador seleccionado no se cierra', async () => {
      prisma.needs.findFirst.mockResolvedValue(row('provider_selected', ['public/a.webp']));
      expect(await codeOf(service.close(9n, 5n))).toBe('NEED_STATE');
      expect(storage.copyToWithdrawn).not.toHaveBeenCalled();
    });

    it('cerrarla otra vez sin fotos públicas no hace nada', async () => {
      prisma.needs.findFirst.mockResolvedValue(row('closed', ['withdrawn/a.webp']));

      await expect(service.close(9n, 5n)).resolves.toMatchObject({ estado: 'cerrada', acciones: [], fotos: [] });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('HU-28 consulta para prestadores', () => {
    it('solo abiertas, de cuentas activas, futuras, ajenas; filtra por categoría y comuna', async () => {
      await service.board(9n, { categoriaId: '3', comunaId: '2', pagina: 1, tamano: 20 });

      const where = prisma.needs.findMany.mock.calls[0][0].where.AND[0];
      expect(where).toMatchObject({
        need_statuses: { status_name: 'open' },
        users: { account_statuses: { status_name: { not: 'disabled' } } },
        client_id: { not: 9n },
        OR: [{ category_id: 3 }, { categories: { parent_category_id: 3 } }],
        neighborhoods: { commune_id: 2 },
      });
      expect(where.preferred_datetime.gt).toBeInstanceOf(Date);
    });

    it('filtra por barrio', async () => {
      await service.board(9n, { barrioId: '3' });
      expect(prisma.needs.findMany.mock.calls[0][0].where.AND[0].neighborhood_id).toBe(3);
    });

    it('nunca muestra la dirección exacta, el estado ni datos del cliente', async () => {
      const { resultados: [need] } = await service.board(9n, {});

      expect(need).toEqual({
        id: '5',
        titulo: 'Cambio de breaker',
        descripcion: 'Se quemó anoche',
        oficio: { id: '4', nombre: 'Instalaciones eléctricas' },
        zona: { barrioId: '3', barrio: 'Sur', comunaId: '2', comuna: 'Comuna 2' },
        fechaPreferida: '2026-10-27T00:00:00.000Z',
        presupuestoMin: 40000,
        presupuestoMax: 90000,
        moneda: 'COP',
        fotos: [],
        publicada: '2026-10-19T12:00:00.000Z',
        deTuOficio: true,
      });
    });

    it('primero las de sus oficios y después las de otros, paginando sobre los dos grupos', async () => {
      // 2 de sus oficios y 3 de otros
      prisma.needs.count.mockImplementation(({ where }: any) => Promise.resolve('in' in where.AND[1].category_id ? 2 : 3));
      prisma.needs.findMany.mockImplementation(({ take }: any) => Promise.resolve(Array(Math.min(take, 2)).fill(row('open'))));

      const first = await service.board(9n, { pagina: 1, tamano: 3 });
      const [own, others] = prisma.needs.findMany.mock.calls.map((c: any) => c[0]);
      expect(own).toMatchObject({ where: { AND: [expect.anything(), { category_id: { in: [4] } }] }, skip: 0, take: 3 });
      expect(others).toMatchObject({ where: { AND: [expect.anything(), { category_id: { notIn: [4] } }] }, skip: 0, take: 1 });
      expect(first.total).toBe(5);
      expect(first.resultados.map((r) => r.deTuOficio)).toEqual([true, true, false]);

      prisma.needs.findMany.mockClear();
      await service.board(9n, { pagina: 2, tamano: 3 });
      expect(prisma.needs.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.needs.findMany.mock.calls[0][0]).toMatchObject({ skip: 1, take: 3 });
    });

    it('el detalle de una no visible es 404', async () => {
      prisma.needs.findFirst.mockResolvedValue(null);
      await expect(service.getForProvider(9n, 5n)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
