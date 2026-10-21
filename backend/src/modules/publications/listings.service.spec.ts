import { HttpException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { ListingsService } from './listings.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const photo = { buffer: Buffer.from('x'), size: 10 };
const dto = { titulo: 'Instalación de lámparas', oficioId: '7', descripcion: 'Lámparas y tomas', precioMin: 50000, precioMax: 80000 };

const row = (status: string, photos = ['public/a.webp']) => ({
  service_listing_id: 3n,
  _count: { service_requests: 1 },
  provider_profile_id: 4n,
  category_id: 7,
  title: dto.titulo,
  description: dto.descripcion,
  min_price: '50000',
  max_price: '80000',
  created_at: new Date('2026-10-19T12:00:00Z'),
  updated_at: new Date('2026-10-19T12:00:00Z'),
  listing_statuses: { status_name: status },
  categories: { category_id: 7, category_name: 'Electricista' },
  service_listing_photos: photos.map((photo_url, i) => ({ service_listing_photo_id: BigInt(i + 1), photo_url })),
});

describe('E3 ListingsService', () => {
  let prisma: any;
  let storage: any;
  let service: ListingsService;

  beforeEach(() => {
    prisma = {
      categories: { count: jest.fn().mockResolvedValue(1) },
      provider_categories: { count: jest.fn().mockResolvedValue(1) },
      provider_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ provider_profile_id: 4n }) },
      listing_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ listing_status_id: { active: 1, paused: 2, rejected: 3, withdrawn: 4 }[where.status_name as string] })),
      },
      service_listings: {
        create: jest.fn().mockResolvedValue(row('active')),
        findFirst: jest.fn().mockResolvedValue(row('active')),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(row('paused')),
      },
      service_listing_photos: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      service_requests: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    storage = {
      uploadPublicPhoto: jest.fn().mockResolvedValue('public/nueva.webp'),
      copyToWithdrawn: jest.fn((k: string) => Promise.resolve(k.replace('public/', 'withdrawn/'))),
      remove: jest.fn(),
      publicUrl: jest.fn((k: string) => (k.startsWith('public/') ? `http://api/media/${k.slice(7)}` : null)),
    };
    service = new ListingsService(prisma, storage);
  });

  describe('HU-21 publicar', () => {
    it('queda activa con sus fotos y muestra "precio fijo" solo si los precios son iguales', async () => {
      const listing = await service.create(9n, dto, [photo, photo]);

      expect(prisma.service_listings.create.mock.calls[0][0].data).toMatchObject({
        provider_profile_id: 4n, category_id: 7, status_id: 1, min_price: 50000, max_price: 80000,
        service_listing_photos: { create: [{ photo_url: 'public/nueva.webp' }, { photo_url: 'public/nueva.webp' }] },
      });
      expect(listing).toMatchObject({
        estado: 'activo', precioFijo: false, moneda: 'COP', acciones: ['editar', 'pausar', 'retirar'], contratacionesAbiertas: 1,
      });
    });

    it('rechaza un máximo menor que el mínimo antes de subir fotos', async () => {
      expect(await codeOf(service.create(9n, { ...dto, precioMax: 100 }, [photo]))).toBe('PRICE_RANGE');
      expect(storage.uploadPublicPhoto).not.toHaveBeenCalled();
    });

    it('exige de 1 a 5 fotos', async () => {
      expect(await codeOf(service.create(9n, dto, []))).toBe('LISTING_PHOTOS');
      expect(await codeOf(service.create(9n, dto, Array(6).fill(photo)))).toBe('LISTING_PHOTOS');
    });

    it('un oficio que no es del catálogo (o es una categoría raíz) se rechaza', async () => {
      prisma.categories.count.mockResolvedValue(0);
      expect(await codeOf(service.create(9n, dto, [photo]))).toBe('INVALID_CATEGORY');
    });

    it('solo en uno de los oficios de su perfil (HU-14), y antes de subir fotos', async () => {
      prisma.provider_categories.count.mockResolvedValue(0);

      expect(await codeOf(service.create(9n, dto, [photo]))).toBe('TRADE_NOT_OFFERED');
      expect(prisma.provider_categories.count.mock.calls[0][0].where).toEqual({ provider_profile_id: 4n, category_id: 7 });
      expect(storage.uploadPublicPhoto).not.toHaveBeenCalled();
    });

    it('si falla la segunda foto, borra la primera', async () => {
      storage.uploadPublicPhoto.mockResolvedValueOnce('public/1.webp').mockRejectedValueOnce(new Error('INVALID_IMAGE'));

      await expect(service.create(9n, dto, [photo, photo])).rejects.toThrow('INVALID_IMAGE');
      expect(storage.remove).toHaveBeenCalledWith('public/1.webp');
      expect(prisma.service_listings.create).not.toHaveBeenCalled();
    });
  });

  describe('HU-22 editar', () => {
    it('una publicación ajena o inexistente es 404', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(null);
      await expect(service.update(9n, 3n, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.service_listings.findFirst.mock.calls[0][0].where).toEqual({ service_listing_id: 3n, provider_profiles: { user_id: 9n } });
    });

    it('una retirada no se edita', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(row('withdrawn'));
      expect(await codeOf(service.update(9n, 3n, dto))).toBe('LISTING_STATE');
      expect(prisma.service_listings.update).not.toHaveBeenCalled();
    });

    it('con el mismo oficio no vuelve a revisarlo (uno ya desactivado no impide editar lo demás)', async () => {
      await service.update(9n, 3n, dto);
      expect(prisma.categories.count).not.toHaveBeenCalled();

      await service.update(9n, 3n, { ...dto, oficioId: '8' });
      expect(prisma.categories.count).toHaveBeenCalledTimes(1);
      expect(prisma.provider_categories.count.mock.calls[0][0].where).toEqual({ provider_profile_id: 4n, category_id: 8 });
    });

    it('no cambia a un oficio que no está en su perfil', async () => {
      prisma.provider_categories.count.mockResolvedValue(0);

      expect(await codeOf(service.update(9n, 3n, { ...dto, oficioId: '8' }))).toBe('TRADE_NOT_OFFERED');
      expect(prisma.service_listings.update).not.toHaveBeenCalled();
    });

    it('no agrega una sexta foto y borra la que alcanzó a subir', async () => {
      prisma.service_listing_photos.count.mockResolvedValue(5);

      expect(await codeOf(service.addPhoto(9n, 3n, photo))).toBe('LISTING_PHOTOS');
      expect(prisma.$queryRaw).toHaveBeenCalled(); // FOR UPDATE
      expect(storage.remove).toHaveBeenCalledWith('public/nueva.webp');
    });

    it('no quita la última foto', async () => {
      prisma.service_listing_photos.findFirst.mockResolvedValue({ service_listing_photo_id: 1n, photo_url: 'public/a.webp' });

      expect(await codeOf(service.removePhoto(9n, 3n, 1n))).toBe('LISTING_PHOTOS');
      expect(prisma.service_listing_photos.delete).not.toHaveBeenCalled();
    });

    it('quita una foto y después la borra del almacenamiento', async () => {
      prisma.service_listing_photos.count.mockResolvedValue(2);
      prisma.service_listing_photos.findFirst.mockResolvedValue({ service_listing_photo_id: 2n, photo_url: 'public/b.webp' });

      await service.removePhoto(9n, 3n, 2n);
      expect(prisma.service_listing_photos.findFirst.mock.calls[0][0].where).toEqual({ service_listing_photo_id: 2n, service_listing_id: 3n });
      expect(storage.remove).toHaveBeenCalledWith('public/b.webp');
    });
  });

  describe('HU-23 pausar y activar', () => {
    it('pausa una activa', async () => {
      await expect(service.setPaused(9n, 3n, true)).resolves.toMatchObject({ estado: 'pausado', acciones: ['editar', 'activar', 'retirar'] });
      expect(prisma.service_listings.update.mock.calls[0][0].data).toEqual({ status_id: 2 });
    });

    it('repetir la acción no cambia nada', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(row('paused'));
      await expect(service.setPaused(9n, 3n, true)).resolves.toMatchObject({ estado: 'pausado' });
      expect(prisma.service_listings.update).not.toHaveBeenCalled();
    });

    it('una rechazada (E17) o retirada no se activa', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(row('rejected'));
      expect(await codeOf(service.setPaused(9n, 3n, false))).toBe('LISTING_STATE');

      prisma.service_listings.findFirst.mockResolvedValue(row('withdrawn'));
      expect(await codeOf(service.setPaused(9n, 3n, false))).toBe('LISTING_STATE');
    });
  });

  describe('HU-24 retirar', () => {
    beforeEach(() => prisma.service_listing_photos.count.mockResolvedValue(0));

    it('con contrataciones abiertas responde 409 y no toca nada', async () => {
      prisma.service_requests.count.mockResolvedValue(1);

      expect(await codeOf(service.withdraw(9n, 3n))).toBe('LISTING_OPEN_CONTRACTS');
      expect(prisma.service_requests.count.mock.calls[0][0].where).toEqual({
        source_service_listing_id: 3n,
        request_statuses: { status_name: { notIn: ['completado', 'cancelado', 'rechazado'] } },
      });
      expect(storage.copyToWithdrawn).not.toHaveBeenCalled();
    });

    it('pasa a retirada y sus fotos a withdrawn/ (dejan de servirse por /media)', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(row('active', ['public/a.webp', 'public/b.webp']));

      await service.withdraw(9n, 3n);

      expect(prisma.service_listings.update.mock.calls[0][0].data).toEqual({ status_id: 4 });
      expect(prisma.service_listing_photos.update.mock.calls.map((c: any) => c[0].data.photo_url)).toEqual(['withdrawn/a.webp', 'withdrawn/b.webp']);
      expect(storage.remove.mock.calls.map((c: any) => c[0])).toEqual(['public/a.webp', 'public/b.webp']);
    });

    it('si el trigger la frena porque se abrió una contratación entre medio, responde 409 y borra las copias', async () => {
      prisma.service_requests.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prisma.$transaction.mockRejectedValueOnce(new Error('No se puede retirar una publicación con contrataciones activas'));

      expect(await codeOf(service.withdraw(9n, 3n))).toBe('LISTING_OPEN_CONTRACTS');
      expect(storage.remove).toHaveBeenCalledWith('withdrawn/a.webp');
      expect(storage.remove).not.toHaveBeenCalledWith('public/a.webp');
    });

    it('si se agregó una foto mientras se retiraba, la mueve en otra vuelta', async () => {
      prisma.service_listing_photos.count.mockResolvedValueOnce(1);
      prisma.service_listings.findFirst
        .mockResolvedValueOnce(row('active', ['public/a.webp']))
        .mockResolvedValueOnce(row('withdrawn', ['withdrawn/a.webp', 'public/tarde.webp']));

      await service.withdraw(9n, 3n);

      expect(storage.copyToWithdrawn.mock.calls.map((c: any) => c[0])).toEqual(['public/a.webp', 'public/tarde.webp']);
      expect(prisma.service_requests.count).toHaveBeenCalledTimes(1);
    });

    it('retirarla otra vez sin fotos públicas no hace nada', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(row('withdrawn', ['withdrawn/a.webp']));

      await service.withdraw(9n, 3n);
      expect(prisma.service_listings.update).not.toHaveBeenCalled();
      expect(prisma.service_requests.count).not.toHaveBeenCalled();
    });
  });

  it('HU-25 filtra mis publicaciones por estado, y una retirada sale sin fotos públicas ni acciones', async () => {
    prisma.service_listings.findMany.mockResolvedValue([row('withdrawn', ['withdrawn/a.webp'])]);

    await expect(service.listOwn(9n, 'retirado')).resolves.toEqual([expect.objectContaining({ estado: 'retirado', acciones: [], fotos: [] })]);
    expect(prisma.service_listings.findMany.mock.calls[0][0].where).toEqual({
      provider_profiles: { user_id: 9n },
      listing_statuses: { status_name: 'withdrawn' },
    });
  });
});

describe('HU-27 CatalogService', () => {
  let prisma: any;
  let service: CatalogService;

  const catalogRow = {
    service_listing_id: 3n,
    title: 'Instalación de lámparas',
    description: 'Lámparas y tomas',
    min_price: '60000',
    max_price: '60000',
    provider_profile_id: 4n,
    categories: { category_id: 7, category_name: 'Electricista' },
    service_listing_photos: [{ photo_url: 'public/a.webp' }, { photo_url: 'public/b.webp' }],
    provider_profiles: { users: { first_name: 'Ana', last_name: 'Ríos', profile_photo_url: null } },
  };

  beforeEach(() => {
    prisma = {
      service_listings: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([catalogRow]), findFirst: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ provider_profile_id: 4n, avg_rating: '4.50', rating_count: 2n, identity_verified: true }]),
    };
    const storage = { publicUrl: (k: string | null) => (k?.startsWith('public/') ? `http://api/media/${k.slice(7)}` : null) };
    service = new CatalogService(prisma, storage as any);
  });

  it('solo activas de cuentas no deshabilitadas; una categoría incluye sus oficios', async () => {
    const page = await service.list({ categoriaId: '2', pagina: 2, tamano: 10 });

    expect(prisma.service_listings.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        listing_statuses: { status_name: 'active' },
        provider_profiles: { users: { account_statuses: { status_name: { not: 'disabled' } } } },
        OR: [{ category_id: 2 }, { categories: { parent_category_id: 2 } }],
      },
      skip: 10,
      take: 10,
    });
    expect(page).toMatchObject({ total: 1, pagina: 2, tamano: 10 });
  });

  it('cada tarjeta trae título, oficio, precio, prestador, calificación e insignia, y ningún dato de contacto', async () => {
    const { resultados: [card] } = await service.list({});

    expect(card).toEqual({
      id: '3',
      titulo: 'Instalación de lámparas',
      descripcion: 'Lámparas y tomas',
      oficio: { id: '7', nombre: 'Electricista' },
      precioMin: 60000,
      precioMax: 60000,
      precioFijo: true,
      moneda: 'COP',
      foto: 'http://api/media/a.webp',
      prestador: { id: '4', nombre: 'Ana Ríos', fotoUrl: null, calificacion: { promedio: 4.5, cantidad: 2 }, verificado: true },
    });
  });

  it('el detalle de una publicación no visible es 404', async () => {
    prisma.service_listings.findFirst.mockResolvedValue(null);
    await expect(service.get(3n)).rejects.toBeInstanceOf(NotFoundException);
  });
});
