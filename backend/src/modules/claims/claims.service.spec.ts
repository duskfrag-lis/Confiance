import { HttpException, NotFoundException } from '@nestjs/common';
import { ClaimsService } from './claims.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const STATUS_IDS: Record<string, number> = { abierto: 1, en_revision: 2, informacion_solicitada: 3, resuelto: 4, cerrado: 5 };

describe('E12 ClaimsService', () => {
  let prisma: any;
  let storage: any;
  let notifications: any;
  let service: ClaimsService;

  const photo = { buffer: Buffer.from('foto'), size: 4 };

  // Cliente 9 (Laura) y prestador con usuario 2 (Ana); el usuario 7 no es parte y el 1 es el administrador
  const request = (state = 'completado') => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: null,
    proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });

  const person = (first_name: string, last_name: string) => ({ first_name, last_name, profile_photo_url: null });

  const step = (status: string, note: string | null, at: string, by = person('Ada', 'Admin')) => ({
    note, changed_by: 1n, created_at: new Date(at), claim_statuses: { status_name: status }, users: by,
  });

  const claimRow = (status = 'abierto', history = [step('abierto', null, '2026-10-24T15:00:00Z', person('Laura', 'Gómez'))]) => ({
    claim_id: 50n, service_request_id: 30n, filed_by: 9n, filed_against: 2n, description: 'Siguió goteando.',
    created_at: new Date('2026-10-24T15:00:00Z'), updated_at: new Date('2026-10-24T16:00:00Z'),
    claim_reasons: { reason_name: 'Calidad deficiente' },
    claim_statuses: { status_name: status },
    claim_photos: [{ photo_url: 'private/claims/a.webp' }],
    claim_status_history: history,
    users_claims_filed_byTousers: person('Laura', 'Gómez'),
    users_claims_filed_againstTousers: person('Ana', 'Ruiz'),
    service_requests: {
      client_id: 9n, proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000',
      request_statuses: { status_name: 'completado' }, service_listings: { title: 'Instalación de lámparas' }, needs: null,
      neighborhoods: { neighborhood_name: 'Laureles', communes: { commune_name: 'Laureles-Estadio' } },
    },
  });

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()) },
      claim_reasons: { findUniqueOrThrow: jest.fn().mockResolvedValue({ claim_reason_id: 2 }) },
      claim_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ claim_status_id: STATUS_IDS[where.status_name] })),
      },
      claims: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ claim_id: 50n }),
        findUnique: jest.fn().mockResolvedValue(claimRow()),
        findMany: jest.fn().mockResolvedValue([claimRow()]),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    storage = {
      uploadPrivatePhoto: jest.fn((folder: string) => Promise.resolve(`private/${folder}/nueva.webp`)),
      remove: jest.fn(),
      signedUrl: (key: string) => `firmado:${key}`,
      publicUrl: () => null,
    };
    notifications = { notify: jest.fn() };
    service = new ClaimsService(prisma, storage, notifications);
  });

  describe('HU-54 creación', () => {
    it('el cliente reclama contra el prestador: queda abierto, con fotos privadas y la apertura en el historial', async () => {
      await service.create(9n, 30n, { motivo: 'calidad_deficiente', descripcion: 'Siguió goteando.' }, [photo]);

      expect(prisma.claim_reasons.findUniqueOrThrow).toHaveBeenCalledWith({ where: { reason_name: 'Calidad deficiente' } });
      expect(prisma.claims.create.mock.calls[0][0].data).toEqual({
        service_request_id: 30n, filed_by: 9n, filed_against: 2n, reason_id: 2, description: 'Siguió goteando.', status_id: 1,
        claim_photos: { create: [{ photo_url: 'private/claims/nueva.webp' }] },
        claim_status_history: { create: { status_id: 1, changed_by: 9n } },
      });
      expect(notifications.notify.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2n, type: 'claim_updated' })]);
    });

    it('el prestador reclama contra el cliente (HU-54.1)', async () => {
      await service.create(2n, 30n, { motivo: 'transferencia_no_confirmada', descripcion: 'No llegó.' }, undefined);

      expect(prisma.claims.create.mock.calls[0][0].data).toMatchObject({ filed_by: 2n, filed_against: 9n });
    });

    it('fuera de FINALIZADO o COMPLETADO, REQUEST_STATE; un tercero, 404; en ambos casos se borran las fotos', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('confirmado'));
      expect(await codeOf(service.create(9n, 30n, { motivo: 'otro', descripcion: 'x' }, [photo]))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request());
      await expect(service.create(7n, 30n, { motivo: 'otro', descripcion: 'x' }, [photo])).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.remove).toHaveBeenCalledTimes(2);
      expect(prisma.claims.create).not.toHaveBeenCalled();
    });

    it('con un reclamo activo propio sobre la misma contratación, CLAIM_OPEN; más de 5 fotos, CLAIM_PHOTOS', async () => {
      prisma.claims.count.mockResolvedValue(1);
      expect(await codeOf(service.create(9n, 30n, { motivo: 'otro', descripcion: 'x' }, undefined))).toBe('CLAIM_OPEN');

      expect(await codeOf(service.create(9n, 30n, { motivo: 'otro', descripcion: 'x' }, Array(6).fill(photo)))).toBe('CLAIM_PHOTOS');
      expect(storage.uploadPrivatePhoto).not.toHaveBeenCalled();
    });
  });

  describe('HU-54.4 consulta de las partes', () => {
    it('quien lo presentó y la otra parte lo ven, con fotos firmadas; un tercero recibe 404', async () => {
      await expect(service.detail(9n, 50n)).resolves.toMatchObject({
        id: '50', motivo: 'calidad_deficiente', estado: 'abierto', mio: true, contraparte: { nombre: 'Ana Ruiz' },
        fotos: ['firmado:private/claims/a.webp'], historial: [{ estado: 'abierto', nota: null }], resolucion: null,
      });
      await expect(service.detail(2n, 50n)).resolves.toMatchObject({ mio: false, contraparte: { nombre: 'Laura Gómez' } });
      await expect(service.detail(7n, 50n)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resuelto, la resolución es la nota del último cambio', async () => {
      prisma.claims.findUnique.mockResolvedValue(claimRow('resuelto', [
        step('abierto', null, '2026-10-24T15:00:00Z'),
        step('resuelto', 'El prestador volvió y lo arregló.', '2026-10-25T15:00:00Z'),
      ]));

      await expect(service.detail(9n, 50n)).resolves.toMatchObject({
        resolucion: { texto: 'El prestador volvió y lo arregló.', fecha: '2026-10-25T15:00:00.000Z' },
      });
    });

    it('la lista sale del perfil activo', async () => {
      await service.mine({ userId: 2n, activeProfile: 'provider' } as never);

      expect(prisma.claims.findMany.mock.calls[0][0].where).toEqual({
        OR: [{ filed_by: 2n }, { filed_against: 2n }],
        service_requests: { provider_profiles: { user_id: 2n } },
      });
    });
  });

  describe('HU-57 administrador', () => {
    it('filtra por estado y por días en hora de Colombia (HU-57.1)', async () => {
      await service.adminList({ estado: 'abierto', desde: '2026-10-01', hasta: '2026-10-24' });

      expect(prisma.claims.findMany.mock.calls[0][0].where).toEqual({
        claim_statuses: { status_name: 'abierto' },
        created_at: { gte: new Date('2026-10-01T05:00:00Z'), lt: new Date('2026-10-25T05:00:00Z') },
      });
      expect(await codeOf(service.adminList({ desde: '2026-10-24', hasta: '2026-10-01' }))).toBe('DATE_RANGE');
    });

    it('el detalle trae la contratación, las partes con su rol y el historial con el administrador (HU-57.2)', async () => {
      prisma.claims.findUnique.mockResolvedValue(claimRow('en_revision', [
        step('abierto', null, '2026-10-24T15:00:00Z', person('Laura', 'Gómez')),
        step('en_revision', 'Revisando con las partes.', '2026-10-24T16:00:00Z'),
      ]));

      await expect(service.adminDetail(50n)).resolves.toMatchObject({
        presentadoPor: { nombre: 'Laura Gómez', rol: 'cliente' },
        contra: { nombre: 'Ana Ruiz', rol: 'prestador' },
        historial: [{ estado: 'abierto', admin: null }, { estado: 'en_revision', nota: 'Revisando con las partes.', admin: 'Ada Admin' }],
        contratacion: { id: '30', estado: 'completado', valor: 80000, zona: 'Laureles, Laureles-Estadio' },
      });
    });

    it('un cambio permitido guarda la resolución en el historial y avisa a las dos partes (HU-57.4, HU-57.5)', async () => {
      await service.changeStatus(1n, 50n, { estado: 'en_revision', resolucion: 'Revisando con las partes.' });

      expect(prisma.claims.update.mock.calls[0][0].data).toEqual({
        status_id: 2, resolution: 'Revisando con las partes.',
        claim_status_history: { create: { status_id: 2, note: 'Revisando con las partes.', changed_by: 1n } },
      });
      expect(notifications.notify.mock.calls[0][0].map((n: { userId: bigint }) => n.userId)).toEqual([9n, 2n]);
    });

    it('un cambio no permitido, CLAIM_TRANSITION; si es parte, OWN_CLAIM; si no existe, 404', async () => {
      prisma.claims.findUnique.mockResolvedValue(claimRow('cerrado'));
      expect(await codeOf(service.changeStatus(1n, 50n, { estado: 'en_revision', resolucion: 'x' }))).toBe('CLAIM_TRANSITION');

      prisma.claims.findUnique.mockResolvedValue(claimRow());
      expect(await codeOf(service.changeStatus(9n, 50n, { estado: 'cerrado', resolucion: 'x' }))).toBe('OWN_CLAIM');

      prisma.claims.findUnique.mockResolvedValue(null);
      await expect(service.changeStatus(1n, 50n, { estado: 'cerrado', resolucion: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.claims.update).not.toHaveBeenCalled();
    });
  });
});
