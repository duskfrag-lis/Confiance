import { HttpException, NotFoundException } from '@nestjs/common';
import { BankAccountService } from './bank-account.service';
import { EvidenceService } from './evidence.service';
import { PublicProfileService } from './public-profile.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('HU-18 BankAccountService', () => {
  let prisma: any;
  let service: BankAccountService;
  const dto = { banco: 'Bancolombia', tipoCuenta: 'ahorros' as const, numero: '12345678901' };
  const stored = { bank_name: 'Bancolombia', account_number: '12345678901', bank_account_types: { type_name: 'savings' } };

  beforeEach(() => {
    prisma = {
      users: { findUniqueOrThrow: jest.fn() },
      bank_account_types: { findUniqueOrThrow: jest.fn().mockResolvedValue({ account_type_id: 1 }) },
      provider_bank_accounts: { upsert: jest.fn().mockResolvedValue(stored), findUnique: jest.fn(), findFirst: jest.fn() },
      service_requests: { count: jest.fn() },
    };
    service = new BankAccountService(prisma);
  });

  it('con el correo sin verificar no deja registrarla (D-57)', async () => {
    prisma.users.findUniqueOrThrow.mockResolvedValue({ email_verified: false, provider_profiles: { provider_profile_id: 4n } });

    expect(await codeOf(service.upsert(7n, dto))).toBe('EMAIL_NOT_VERIFIED');
    expect(prisma.provider_bank_accounts.upsert).not.toHaveBeenCalled();
  });

  it('con el correo verificado la crea o la reemplaza', async () => {
    prisma.users.findUniqueOrThrow.mockResolvedValue({ email_verified: true, provider_profiles: { provider_profile_id: 4n } });

    await expect(service.upsert(7n, dto)).resolves.toEqual({ banco: 'Bancolombia', tipoCuenta: 'ahorros', numero: '12345678901' });
    expect(prisma.provider_bank_accounts.upsert.mock.calls[0][0].where).toEqual({ provider_profile_id: 4n });
  });

  it('el cliente la ve solo con una contratación de ACEPTADO a FINALIZADO con ese prestador', async () => {
    prisma.service_requests.count.mockResolvedValue(0);
    expect(await codeOf(service.getForClient(9n, 4n))).toBe('BANK_ACCOUNT_HIDDEN');

    prisma.service_requests.count.mockResolvedValue(1);
    prisma.provider_bank_accounts.findUnique.mockResolvedValue(stored);
    await expect(service.getForClient(9n, 4n)).resolves.toMatchObject({ banco: 'Bancolombia' });

    expect(prisma.service_requests.count.mock.calls[0][0].where).toEqual({
      client_id: 9n,
      provider_profile_id: 4n,
      request_statuses: { status_name: { in: ['aceptado', 'confirmado', 'en_curso', 'finalizado'] } },
    });
  });

  it('si el prestador no la tiene, devuelve null (el cliente solo puede pagar por PSE)', async () => {
    prisma.service_requests.count.mockResolvedValue(1);
    prisma.provider_bank_accounts.findUnique.mockResolvedValue(null);

    await expect(service.getForClient(9n, 4n)).resolves.toBeNull();
  });
});

describe('HU-19 EvidenceService', () => {
  let prisma: any;
  let storage: { uploadPublicPhoto: jest.Mock; remove: jest.Mock; publicUrl: jest.Mock };
  let service: EvidenceService;
  const photo = { buffer: Buffer.alloc(1), size: 1 };

  beforeEach(() => {
    prisma = {
      provider_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ provider_profile_id: 4n }) },
      evidence_statuses: { findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ evidence_status_id: where.status_name === 'published' ? 1 : 2 })) },
      work_evidence: {
        create: jest.fn().mockResolvedValue({ work_evidence_id: 10n, description: 'Pintura', created_at: new Date(), work_evidence_photos: [{ photo_url: 'public/a.webp' }] }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    let n = 0;
    storage = {
      uploadPublicPhoto: jest.fn(() => Promise.resolve(`public/${++n}.webp`)),
      remove: jest.fn(),
      publicUrl: jest.fn((k: string) => `url:${k}`),
    };
    service = new EvidenceService(prisma, storage as never);
  });

  it.each([[[]], [Array(6).fill(photo)]])('exige entre 1 y 5 fotos', async (files) => {
    expect(await codeOf(service.create(7n, { descripcion: 'x' }, files))).toBe('EVIDENCE_PHOTOS');
  });

  it('se publica al cargarla, con sus fotos', async () => {
    await expect(service.create(7n, { descripcion: 'Pintura' }, [photo, photo])).resolves.toMatchObject({ id: '10', retirada: false });

    const { data } = prisma.work_evidence.create.mock.calls[0][0];
    expect(data).toMatchObject({ provider_profile_id: 4n, status_id: 1, work_evidence_photos: { create: [{ photo_url: 'public/1.webp' }, { photo_url: 'public/2.webp' }] } });
  });

  it('si una foto es inválida, borra las que ya había subido', async () => {
    storage.uploadPublicPhoto.mockResolvedValueOnce('public/ok.webp').mockRejectedValueOnce(new Error('INVALID_IMAGE'));

    await expect(service.create(7n, { descripcion: 'x' }, [photo, photo])).rejects.toThrow('INVALID_IMAGE');
    expect(storage.remove).toHaveBeenCalledWith('public/ok.webp');
    expect(prisma.work_evidence.create).not.toHaveBeenCalled();
  });

  it('retirar: solo la propia, y queda conservada como retirada', async () => {
    prisma.work_evidence.findFirst.mockResolvedValue(null);
    await expect(service.withdraw(7n, 10n)).rejects.toBeInstanceOf(NotFoundException);

    prisma.work_evidence.findFirst.mockResolvedValue({ evidence_statuses: { status_name: 'published' } });
    await service.withdraw(7n, 10n);
    expect(prisma.work_evidence.update).toHaveBeenCalledWith({ where: { work_evidence_id: 10n }, data: { status_id: 2 } });
    expect(prisma.work_evidence.findFirst.mock.calls[0][0].where).toEqual({ work_evidence_id: 10n, provider_profiles: { user_id: 7n } });
  });
});

describe('HU-20 PublicProfileService', () => {
  const profileRow = {
    bio: 'Pintor',
    users: { first_name: 'Pedro', last_name: 'Ruiz', profile_photo_url: null, email: 'no@debe.salir', id_number: '123', phone: '300' },
    provider_categories: [],
    provider_service_areas: [],
    provider_availability: [],
    service_listings: [{ service_listing_id: 3n, title: 'Pintura de casas', min_price: '50000.00', max_price: '200000.00' }],
  };

  const build = (summary: object[]) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(summary),
      provider_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue(profileRow) },
    };
    return new PublicProfileService(
      prisma as never,
      { publicUrl: () => null } as never,
      { groupZones: jest.fn().mockResolvedValue([]) } as never,
      { listPublished: jest.fn().mockResolvedValue([]) } as never,
    );
  };

  it('no muestra perfiles inexistentes ni de cuentas deshabilitadas (HU-20.4)', async () => {
    await expect(build([]).get(4n)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calcula calificación y servicios completados, y nunca expone datos privados (HU-20.3)', async () => {
    const result = await build([{ avg_rating: '4.50', rating_count: 2n, identity_verified: true, completed_services: 3n }]).get(4n);

    expect(result).toMatchObject({
      nombre: 'Pedro Ruiz',
      calificacion: { promedio: 4.5, cantidad: 2 },
      serviciosCompletados: 3,
      verificado: true,
      publicaciones: [{ id: '3', titulo: 'Pintura de casas', precioMin: 50000, precioMax: 200000 }],
    });
    expect(JSON.stringify(result)).not.toMatch(/no@debe\.salir|"123"|"300"/);
  });
});
