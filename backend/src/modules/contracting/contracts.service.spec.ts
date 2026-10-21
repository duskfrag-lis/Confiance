import { HttpException } from '@nestjs/common';
import { ContractsService } from './contracts.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const future = () => new Date(Date.now() + 86_400_000);

const STATUS_IDS: Record<string, number> = { solicitado: 1, aceptado: 2, confirmado: 3, rechazado: 8 };

describe('E5 ContractsService', () => {
  let prisma: any;
  let notifications: any;
  let service: ContractsService;

  const listing = (ownerUserId = 2n) => ({
    service_listing_id: 12n, title: 'Instalación de lámparas', min_price: '50000', max_price: '90000', provider_profile_id: 4n,
    provider_profiles: { user_id: ownerUserId, users: { first_name: 'Ana', last_name: 'Ruiz' } },
  });

  const request = (state = 'solicitado', when = future(), needId: bigint | null = null) => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: needId, proposed_datetime: when,
    agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: needId ? null : { title: 'Instalación de lámparas' },
    needs: needId ? { title: 'Cambio de breaker' } : null,
  });

  const dto = (overrides = {}) => ({
    publicacionId: '12', fechaHora: future().toISOString(), barrioId: '3', direccion: 'Calle 10 # 5-20', valor: 80000, ...overrides,
  });

  const slot = (overrides = {}) => [{ in_block: true, available: true, taken: false, ...overrides }];

  beforeEach(() => {
    prisma = {
      service_listings: { findFirst: jest.fn().mockResolvedValue(listing()) },
      neighborhoods: { count: jest.fn().mockResolvedValue(1) },
      client_profiles: { findUnique: jest.fn().mockResolvedValue(null) },
      request_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ request_status_id: STATUS_IDS[where.status_name] })),
      },
      service_requests: {
        create: jest.fn().mockResolvedValue(request()),
        findUnique: jest.fn().mockResolvedValue(request()),
        findMany: jest.fn().mockResolvedValue([request()]),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue(slot()),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new ContractsService(prisma, notifications);
  });

  describe('HU-34 iniciar la solicitud', () => {
    it('la crea en SOLICITADO desde la publicación, con el actor fijado, y avisa al prestador', async () => {
      const created = await service.create(9n, dto());

      expect(prisma.service_listings.findFirst.mock.calls[0][0].where).toMatchObject({
        service_listing_id: 12n,
        listing_statuses: { status_name: 'active' },
        provider_profiles: { users: { account_statuses: { status_name: { not: 'disabled' } } } },
      });
      expect(prisma.service_requests.create.mock.calls[0][0].data).toMatchObject({
        client_id: 9n, provider_profile_id: 4n, source_service_listing_id: 12n, neighborhood_id: 3,
        exact_address: 'Calle 10 # 5-20', agreed_price: 80000, status_id: 1,
      });
      expect(prisma.$queryRaw.mock.calls.some((c: any[]) => c[0].join('').includes("set_config('app.user_id'"))).toBe(true);
      expect(notifications.notify).toHaveBeenCalledWith([expect.objectContaining({ userId: 2n, type: 'request_received' })], prisma);
      expect(created).toMatchObject({ id: '30', estado: 'solicitado', valor: 80000 });
    });

    it('nadie se contrata a sí mismo (HU-34.7)', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(listing(9n));
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe('SELF_HIRE');
    });

    it('una publicación pausada, retirada o de una cuenta deshabilitada no existe para solicitar (HU-34.1)', async () => {
      prisma.service_listings.findFirst.mockResolvedValue(null);
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe(404);
    });

    it('la fecha debe ser futura', async () => {
      await expect(codeOf(service.create(9n, dto({ fechaHora: new Date(Date.now() - 60_000).toISOString() })))).resolves.toBe('PAST_DATE');
    });

    it('fuera de un bloque o de la disponibilidad del prestador no se solicita (HU-34.4)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(slot({ in_block: false }));
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe('OUTSIDE_AVAILABILITY');
      prisma.$queryRaw.mockResolvedValueOnce(slot({ available: false }));
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe('OUTSIDE_AVAILABILITY');
    });

    it('en un bloque ya ocupado no se solicita, porque no se podría aceptar', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(slot({ taken: true }));
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe('SLOT_TAKEN');
      expect(prisma.service_requests.create).not.toHaveBeenCalled();
    });

    it('el barrio debe existir y estar activo', async () => {
      prisma.neighborhoods.count.mockResolvedValue(0);
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe('INVALID_ZONE');
    });

    it('si la publicación se pausa entre la revisión y el guardado, la regla de la base sale como 404', async () => {
      prisma.service_requests.create.mockRejectedValue(new Error('La publicación 12 no está activa (estado = paused)'));
      await expect(codeOf(service.create(9n, dto()))).resolves.toBe(404);
    });

    it('prepara el formulario con el rango de precio, la zona del cliente y los bloques libres', async () => {
      prisma.client_profiles.findUnique.mockResolvedValue({
        reference_address: 'Calle 10 # 5-20',
        neighborhoods: { neighborhood_id: 3, neighborhood_name: 'Laureles', communes: { commune_id: 11, commune_name: 'Laureles-Estadio' } },
      });
      prisma.$queryRaw.mockResolvedValue([{ fecha: '2026-10-21', block_name: 'morning', inicio: '06:00', fin: '12:00' }]);

      await expect(service.prepare(9n, 12n)).resolves.toEqual({
        publicacion: { id: '12', titulo: 'Instalación de lámparas', precioMin: 50000, precioMax: 90000, precioFijo: false },
        prestador: { id: '4', nombre: 'Ana Ruiz' },
        zona: { barrioId: '3', barrio: 'Laureles', comunaId: '11', comuna: 'Laureles-Estadio' },
        direccion: 'Calle 10 # 5-20',
        horarios: [{ fecha: '2026-10-21', bloque: 'manana', inicio: '06:00', fin: '12:00' }],
      });
    });
  });

  describe('HU-36 aceptar o rechazar', () => {
    it('acepta: bloquea la fila, pasa a ACEPTADO y avisa al cliente', async () => {
      prisma.$queryRaw.mockResolvedValue([{ taken: false }]);

      await expect(service.accept(2n, 30n)).resolves.toMatchObject({ estado: 'aceptado' });

      const sql = prisma.$queryRaw.mock.calls.map((c: any[]) => c[0].join(''));
      expect(sql.some((s: string) => s.includes('FOR UPDATE'))).toBe(true);
      expect(prisma.service_requests.update.mock.calls[0][0].data.request_statuses).toEqual({ connect: { request_status_id: 2 } });
      expect(notifications.notify).toHaveBeenCalledWith([expect.objectContaining({ userId: 9n, type: 'request_accepted' })], prisma);
    });

    it('no acepta con el bloque ocupado ni con la fecha pasada (HU-36.2)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ taken: true }]);
      await expect(codeOf(service.accept(2n, 30n))).resolves.toBe('SLOT_TAKEN');

      prisma.service_requests.findUnique.mockResolvedValue(request('solicitado', new Date(Date.now() - 60_000)));
      await expect(codeOf(service.accept(2n, 30n))).resolves.toBe('PAST_DATE');
      expect(prisma.service_requests.update).not.toHaveBeenCalled();
    });

    it('dos aceptaciones simultáneas: la base frena la segunda y sale SLOT_TAKEN', async () => {
      prisma.$queryRaw.mockResolvedValue([{ taken: false }]);
      prisma.service_requests.update.mockRejectedValue(
        new Error('El prestador ya tiene una contratación aceptada en ese día y bloque horario (provider_profile_id = 4)'),
      );
      await expect(codeOf(service.accept(2n, 30n))).resolves.toBe('SLOT_TAKEN');
    });

    it('solo se responde en SOLICITADO', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('aceptado'));
      await expect(codeOf(service.accept(2n, 30n))).resolves.toBe('REQUEST_STATE');
      await expect(codeOf(service.reject(2n, 30n, {}))).resolves.toBe('REQUEST_STATE');
    });

    it('otro prestador o el cliente no pueden responder: 404 sin revelar que existe', async () => {
      await expect(codeOf(service.accept(7n, 30n))).resolves.toBe(404);
      await expect(codeOf(service.reject(9n, 30n, {}))).resolves.toBe(404);
      prisma.service_requests.findUnique.mockResolvedValue(null);
      await expect(codeOf(service.accept(2n, 30n))).resolves.toBe(404);
    });

    it('rechaza con motivo y se lo cuenta al cliente', async () => {
      await expect(service.reject(2n, 30n, { motivo: 'No tengo los materiales' })).resolves.toMatchObject({ estado: 'rechazado' });

      expect(prisma.service_requests.update.mock.calls[0][0].data).toMatchObject({
        rejection_reason: 'No tengo los materiales', request_statuses: { connect: { request_status_id: 8 } },
      });
      const [[notice]] = notifications.notify.mock.calls[0];
      expect(notice).toMatchObject({ userId: 9n, type: 'request_rejected' });
      expect(notice.message).toContain('Motivo: No tengo los materiales');
      expect(notice.message).not.toContain('necesidad');
    });

    it('si venía de una necesidad, el aviso dice que volvió a quedar abierta', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('solicitado', future(), 5n));
      await service.reject(2n, 30n, {});

      const [[notice]] = notifications.notify.mock.calls[0];
      expect(notice.message).toContain('"Cambio de breaker"');
      expect(notice.message).toContain('volvió a quedar abierta');
    });
  });

  describe('HU-37 confirmar', () => {
    it('pasa de ACEPTADO a CONFIRMADO y avisa a las dos partes', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('aceptado'));

      await expect(service.confirm(9n, 30n)).resolves.toMatchObject({ estado: 'confirmado' });

      expect(prisma.service_requests.update.mock.calls[0][0].data.request_statuses).toEqual({ connect: { request_status_id: 3 } });
      expect(notifications.notify.mock.calls[0][0].map((n: any) => [n.userId, n.type])).toEqual([
        [2n, 'request_confirmed'],
        [9n, 'request_confirmed'],
      ]);
    });

    it('solo el cliente de la contratación, solo en ACEPTADO y con la fecha futura', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('aceptado'));
      await expect(codeOf(service.confirm(2n, 30n))).resolves.toBe(404);

      prisma.service_requests.findUnique.mockResolvedValue(request('solicitado'));
      await expect(codeOf(service.confirm(9n, 30n))).resolves.toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request('aceptado', new Date(Date.now() - 60_000)));
      await expect(codeOf(service.confirm(9n, 30n))).resolves.toBe('PAST_DATE');
    });
  });

  describe('HU-52 cancelación automática', () => {
    it('avisa al cliente y al prestador de cada contratación cancelada', async () => {
      prisma.$queryRaw.mockResolvedValue([{ cancelled_request_id: 30n, previous_state: 'solicitado' }]);

      await expect(service.autoCancelStale()).resolves.toBe(1);

      const notices = notifications.notify.mock.calls[0][0];
      expect(notices.map((n: any) => [n.userId, n.type])).toEqual([
        [9n, 'request_auto_cancelled'],
        [2n, 'request_auto_cancelled'],
      ]);
      expect(notices[0].message).toContain('no respondió en 48 horas');
    });

    it('sin nada vencido no avisa', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.autoCancelStale()).resolves.toBe(0);
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
