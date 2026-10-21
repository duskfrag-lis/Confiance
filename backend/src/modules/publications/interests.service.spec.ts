import { HttpException, NotFoundException } from '@nestjs/common';
import { InterestsService } from './interests.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const future = () => new Date(Date.now() + 86_400_000);

const ids = {
  interest_statuses: { pending: 1, selected: 2, not_selected: 3 },
  need_statuses: { open: 1, provider_selected: 2, closed: 3 },
  request_statuses: { solicitado: 1 },
} as Record<string, Record<string, number>>;

const lookup = (table: string, idField: string) =>
  jest.fn(({ where }) => Promise.resolve({ [idField]: ids[table][where.status_name as string] }));

describe('E3 InterestsService', () => {
  let prisma: any;
  let notifications: any;
  let service: InterestsService;

  const need = (status = 'open', preferred = future()) => ({
    need_id: 5n, client_id: 9n, title: 'Cambio de breaker', neighborhood_id: 3, exact_address: 'Calle 10 # 5-20',
    preferred_datetime: preferred, need_statuses: { status_name: status },
  });

  const interest = (price: string | null = '70000', account = 'active', state = 'pending') => ({
    need_interest_id: 11n, need_id: 5n, provider_profile_id: 4n, proposed_price: price, interest_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { account_statuses: { status_name: account } } },
  });

  beforeEach(() => {
    prisma = {
      provider_profiles: { findUniqueOrThrow: jest.fn().mockResolvedValue({ provider_profile_id: 4n }) },
      needs: {
        findFirst: jest.fn().mockResolvedValue(need()),
        update: jest.fn(),
      },
      need_interests: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve({ ...data, need_interest_id: 11n, created_at: new Date('2026-10-19T12:00:00Z') })),
        findFirst: jest.fn().mockResolvedValue(interest()),
        findMany: jest.fn().mockResolvedValue([{ provider_profiles: { user_id: 3n } }]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      interest_statuses: { findUniqueOrThrow: lookup('interest_statuses', 'interest_status_id') },
      need_statuses: { findUniqueOrThrow: lookup('need_statuses', 'need_status_id') },
      request_statuses: { findUniqueOrThrow: lookup('request_statuses', 'request_status_id') },
      service_requests: { create: jest.fn().mockResolvedValue({ service_request_id: 30n }) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new InterestsService(prisma, { publicUrl: () => null } as any, notifications);
  });

  describe('HU-29 mostrar interés', () => {
    it('lo crea pendiente, bloquea la necesidad y avisa al cliente en la misma transacción', async () => {
      const created = await service.create(2n, 5n, { mensaje: 'Puedo ir en la noche', precioPropuesto: 70000 });

      expect(prisma.needs.findFirst.mock.calls[0][0].where).toMatchObject({
        need_id: 5n,
        need_statuses: { status_name: 'open' },
        users: { account_statuses: { status_name: { not: 'disabled' } } },
        client_id: { not: 2n },
      });
      expect(prisma.need_interests.create.mock.calls[0][0].data).toEqual({
        need_id: 5n, provider_profile_id: 4n, message: 'Puedo ir en la noche', proposed_price: 70000, status_id: 1,
      });
      expect(notifications.notify).toHaveBeenCalledWith([expect.objectContaining({ userId: 9n, type: 'interest_received' })], prisma);
      expect(created).toMatchObject({ estado: 'pendiente', precioPropuesto: 70000, necesidad: { id: '5', titulo: 'Cambio de breaker' } });
    });

    it('mensaje y precio son opcionales', async () => {
      await expect(service.create(2n, 5n, {})).resolves.toMatchObject({ mensaje: null, precioPropuesto: null });
    });

    it('una vez por necesidad', async () => {
      prisma.need_interests.count.mockResolvedValue(1);
      expect(await codeOf(service.create(2n, 5n, {}))).toBe('INTEREST_EXISTS');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('en una que no está visible (cerrada, vencida, propia o de cuenta deshabilitada) es 404', async () => {
      prisma.needs.findFirst.mockResolvedValue(null);
      await expect(service.create(2n, 5n, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('HU-30 seleccionar', () => {
    it('todo en una transacción: elegido, los demás no seleccionados, necesidad y solicitud con los datos de la necesidad', async () => {
      const result = await service.select(9n, 5n, 11n, {});

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // actor de la trazabilidad + FOR UPDATE
      expect(prisma.need_interests.update.mock.calls[0][0]).toEqual({ where: { need_interest_id: 11n }, data: { status_id: 2 } });
      expect(prisma.need_interests.updateMany.mock.calls[0][0]).toEqual({
        where: { need_id: 5n, need_interest_id: { not: 11n } }, data: { status_id: 3 },
      });
      expect(prisma.needs.update.mock.calls[0][0].data).toEqual({ status_id: 2 });
      expect(prisma.service_requests.create.mock.calls[0][0].data).toMatchObject({
        client_id: 9n, provider_profile_id: 4n, source_need_id: 5n, neighborhood_id: 3, exact_address: 'Calle 10 # 5-20',
        agreed_price: 70000, status_id: 1,
      });
      expect(notifications.notify.mock.calls[0][0]).toEqual([
        expect.objectContaining({ userId: 2n, type: 'interest_selected', serviceRequestId: 30n }),
        expect.objectContaining({ userId: 3n, type: 'interest_not_selected' }),
      ]);
      expect(result).toMatchObject({ solicitudId: '30', estado: 'solicitado', valor: 70000 });
    });

    it('el valor es el precio propuesto aunque el cliente mande otro', async () => {
      await service.select(9n, 5n, 11n, { valor: 1000 });
      expect(prisma.service_requests.create.mock.calls[0][0].data.agreed_price).toBe(70000);
    });

    it('sin precio propuesto (o propuesto en 0), el cliente debe indicar el valor', async () => {
      prisma.need_interests.findFirst.mockResolvedValue(interest(null));
      expect(await codeOf(service.select(9n, 5n, 11n, {}))).toBe('PRICE_REQUIRED');

      prisma.need_interests.findFirst.mockResolvedValue(interest('0'));
      await service.select(9n, 5n, 11n, { valor: 65000 });
      expect(prisma.service_requests.create.mock.calls[0][0].data.agreed_price).toBe(65000);
    });

    it('solo en una necesidad propia, abierta y con fecha futura', async () => {
      prisma.needs.findFirst.mockResolvedValue(null);
      await expect(service.select(9n, 5n, 11n, {})).rejects.toBeInstanceOf(NotFoundException);

      prisma.needs.findFirst.mockResolvedValue(need('provider_selected'));
      expect(await codeOf(service.select(9n, 5n, 11n, {}))).toBe('NEED_STATE');

      prisma.needs.findFirst.mockResolvedValue(need('open', new Date(Date.now() - 60_000)));
      expect(await codeOf(service.select(9n, 5n, 11n, {}))).toBe('NEED_EXPIRED');

      expect(prisma.service_requests.create).not.toHaveBeenCalled();
    });

    it('un interés de otra necesidad es 404 y un prestador deshabilitado no se elige', async () => {
      prisma.need_interests.findFirst.mockResolvedValue(null);
      await expect(service.select(9n, 5n, 11n, {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.need_interests.findFirst.mock.calls[0][0].where).toEqual({ need_interest_id: 11n, need_id: 5n });

      prisma.need_interests.findFirst.mockResolvedValue(interest('70000', 'disabled'));
      expect(await codeOf(service.select(9n, 5n, 11n, {}))).toBe('PROVIDER_UNAVAILABLE');
    });

    it('en una necesidad reabierta no se puede volver a elegir al prestador descartado', async () => {
      prisma.need_interests.findFirst.mockResolvedValue(interest('70000', 'active', 'not_selected'));
      expect(await codeOf(service.select(9n, 5n, 11n, {}))).toBe('INTEREST_STATE');
      expect(prisma.service_requests.create).not.toHaveBeenCalled();
    });
  });

  it('HU-26.6 al cerrar, los pendientes pasan a no seleccionado y se avisa', async () => {
    prisma.need_interests.findMany.mockResolvedValue([{ need_interest_id: 11n, provider_profiles: { user_id: 2n } }]);

    await service.dismissPending(prisma, 5n, 'Cambio de breaker');

    expect(prisma.need_interests.updateMany.mock.calls[0][0]).toEqual({ where: { need_interest_id: { in: [11n] } }, data: { status_id: 3 } });
    expect(notifications.notify.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2n, type: 'interest_not_selected' })]);
  });
});
