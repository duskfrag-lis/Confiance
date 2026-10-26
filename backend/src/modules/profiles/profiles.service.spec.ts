import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.service';
import { ProfilesService } from './profiles.service';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return ((err as HttpException).getResponse() as { code: string }).code;
  }
  throw new Error('se esperaba un error');
};

describe('ProfilesService', () => {
  let prisma: any;
  let storage: { uploadPublicPhoto: jest.Mock; remove: jest.Mock; publicUrl: jest.Mock };
  let service: ProfilesService;

  beforeEach(() => {
    prisma = {
      users: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      client_profiles: { update: jest.fn() },
      provider_profiles: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ provider_profile_id: 4n }) },
      provider_categories: { deleteMany: jest.fn(), createMany: jest.fn() },
      provider_service_areas: { deleteMany: jest.fn(), createMany: jest.fn() },
      provider_availability: { deleteMany: jest.fn(), createMany: jest.fn() },
      neighborhoods: { count: jest.fn() },
      communes: { findMany: jest.fn().mockResolvedValue([]) },
      categories: { count: jest.fn() },
      days_of_week: {
        findMany: jest.fn().mockResolvedValue(
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day_name, i) => ({ day_name, day_of_week_id: i + 1 })),
        ),
      },
      time_blocks: {
        findMany: jest.fn().mockResolvedValue(['morning', 'afternoon', 'evening'].map((block_name, i) => ({ block_name, time_block_id: i + 1 }))),
      },
      $transaction: jest.fn(),
    };
    storage = {
      uploadPublicPhoto: jest.fn().mockResolvedValue('public/nueva.webp'),
      remove: jest.fn(),
      publicUrl: jest.fn((k: string | null) => (k ? `url:${k}` : null)),
    };
    service = new ProfilesService(prisma as unknown as PrismaService, storage as unknown as StorageService);
    jest.spyOn(service, 'getProvider').mockResolvedValue({} as never);
    jest.spyOn(service, 'getClient').mockResolvedValue({} as never);
  });

  describe('foto', () => {
    it('reemplaza la foto y borra la anterior', async () => {
      prisma.users.findUniqueOrThrow.mockResolvedValue({ profile_photo_url: 'public/vieja.webp' });

      await expect(service.updatePhoto(7n, { buffer: Buffer.alloc(1), size: 1 })).resolves.toEqual({ fotoUrl: 'url:public/nueva.webp' });
      expect(prisma.users.update).toHaveBeenCalledWith({ where: { user_id: 7n }, data: { profile_photo_url: 'public/nueva.webp' } });
      expect(storage.remove).toHaveBeenCalledWith('public/vieja.webp');
    });
  });

  describe('HU-11 perfil del cliente', () => {
    const dto = { nombres: 'Laura Marcela', apellidos: 'Gómez Ríos', celular: '3001234567', barrioId: '4', direccion: 'Calle 1', descripcion: null };

    it('guarda nombres, celular y la zona de referencia', async () => {
      prisma.neighborhoods.count.mockResolvedValue(1);

      await service.updateClient(7n, dto);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { user_id: 7n },
        data: { first_name: 'Laura', middle_name: 'Marcela', last_name: 'Gómez', second_last_name: 'Ríos', phone: '3001234567' },
      });
      expect(prisma.client_profiles.update).toHaveBeenCalledWith({
        where: { user_id: 7n },
        data: { reference_neighborhood_id: 4, reference_address: 'Calle 1', description: null },
      });
    });

    it('rechaza un barrio inactivo o inexistente', async () => {
      prisma.neighborhoods.count.mockResolvedValue(0);

      expect(await codeOf(service.updateClient(7n, dto))).toBe('INVALID_ZONE');
    });
  });

  describe('HU-16 zonas', () => {
    it('una comuna completa agrega todos sus barrios activos, sin repetir', async () => {
      prisma.neighborhoods.count.mockResolvedValue(1);
      prisma.communes.findMany.mockResolvedValue([{ neighborhoods: [{ neighborhood_id: 4 }, { neighborhood_id: 5 }] }]);

      await service.updateZones(7n, { barrios: ['4'], comunas: ['2'] });

      expect(prisma.provider_service_areas.createMany).toHaveBeenCalledWith({
        data: [{ provider_profile_id: 4n, neighborhood_id: 4 }, { provider_profile_id: 4n, neighborhood_id: 5 }],
      });
    });

    it('exige al menos un barrio', async () => {
      expect(await codeOf(service.updateZones(7n, {}))).toBe('ZONES_REQUIRED');
    });

    it('rechaza una comuna inactiva', async () => {
      prisma.communes.findMany.mockResolvedValue([]);

      expect(await codeOf(service.updateZones(7n, { comunas: ['9'] }))).toBe('INVALID_ZONE');
    });
  });

  describe('HU-17 disponibilidad', () => {
    it('reemplaza las franjas por día y bloque, sin duplicados', async () => {
      await service.updateAvailability(7n, {
        franjas: [
          { dia: 'domingo', bloque: 'manana' },
          { dia: 'lunes', bloque: 'noche' },
          { dia: 'domingo', bloque: 'manana' },
        ],
      });

      expect(prisma.provider_availability.deleteMany).toHaveBeenCalledWith({ where: { provider_profile_id: 4n } });
      expect(prisma.provider_availability.createMany).toHaveBeenCalledWith({
        data: [
          { provider_profile_id: 4n, day_of_week_id: 7, time_block_id: 1 },
          { provider_profile_id: 4n, day_of_week_id: 1, time_block_id: 3 },
        ],
      });
    });
  });

  describe('HU-14 oficios', () => {
    it('valida contra el catálogo activo y reemplaza los oficios', async () => {
      prisma.categories.count.mockResolvedValue(2);

      await service.updateTrades(7n, { oficios: ['3', '7'] });

      expect(prisma.provider_categories.createMany).toHaveBeenCalledWith({
        data: [{ provider_profile_id: 4n, category_id: 3 }, { provider_profile_id: 4n, category_id: 7 }],
      });
    });

    it('rechaza oficios inactivos o de primer nivel', async () => {
      prisma.categories.count.mockResolvedValue(1);

      expect(await codeOf(service.updateTrades(7n, { oficios: ['3', '7'] }))).toBe('INVALID_CATEGORY');
    });
  });
});

describe('ProfilesService.getProvider (HU-13.3)', () => {
  it('lista las secciones que faltan; sin descripción el perfil está incompleto (HU-15.2)', async () => {
    const prisma = {
      users: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          profile_photo_url: null,
          provider_profiles: {
            bio: '  ',
            provider_categories: [{ categories: { category_id: 3, category_name: 'Pintura', categories: { category_name: 'Hogar' } } }],
            provider_service_areas: [],
            provider_availability: [{ days_of_week: { day_name: 'sunday' }, time_blocks: { block_name: 'evening' } }],
            identity_verifications: [{ verification_statuses: { status_name: 'correction_requested' } }],
            _count: { work_evidence: 0 },
          },
        }),
      },
    };
    const storage = { publicUrl: () => null };
    const service = new ProfilesService(prisma as never, storage as never);

    await expect(service.getProvider(7n)).resolves.toMatchObject({
      oficios: [{ id: '3', nombre: 'Pintura', categoria: 'Hogar' }],
      disponibilidad: [{ dia: 'domingo', bloque: 'noche' }],
      completo: false,
      faltantes: ['foto', 'descripcion', 'zonas', 'evidencias'],
      verificacion: 'correccion',
    });
  });
});
