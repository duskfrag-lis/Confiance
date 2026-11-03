import { HttpException } from '@nestjs/common';
import { PseService } from './pse.service';
import { WompiError } from './wompi.client';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('HU-43 PseService', () => {
  let prisma: any;
  let wompi: any;
  let notifications: any;
  let service: PseService;

  const request = (state = 'finalizado') => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: null,
    proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });
  const dto = { banco: '1', tipoPersona: 'natural' as const, tipoDocumento: 'CC' as const, documento: '1099888777', aceptaTerminos: true };
  const payment = (status = 'pending', amount = '80000') => ({
    payment_id: 7n, amount, gateway_transaction_id: 'tx-1', service_request_id: 30n, payment_statuses: { status_name: status },
  });
  const tx = (status: string, cents = 8_000_000) => ({ id: 'tx-1', reference: 'CONF-30-ab', status, amount_in_cents: cents });
  const types = () => notifications.notify.mock.calls[0][0].map((n: { userId: bigint; type: string }) => [n.userId, n.type]);

  beforeEach(() => {
    prisma = {
      service_requests: {
        findUnique: jest.fn().mockResolvedValue(request()),
        findUniqueOrThrow: jest.fn(({ select }) =>
          Promise.resolve(select.request_statuses && !select.client_id ? { request_statuses: { status_name: 'finalizado' } } : request())),
      },
      users: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'laura@x.co', phone: '3001234567', first_name: 'Laura', last_name: 'Gómez' }) },
      payments: {
        create: jest.fn().mockResolvedValue({ payment_id: 7n }),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ gateway_transaction_id: 'tx-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(payment()),
      },
      payment_statuses: { findUniqueOrThrow: jest.fn().mockResolvedValue({ payment_status_id: 3 }) },
      $queryRaw: jest.fn().mockResolvedValue([{ payment_id: 7n }]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    wompi = {
      enabled: true,
      environment: 'test',
      terms: jest.fn().mockResolvedValue({ acceptanceToken: 'a', personalDataToken: 'p', termsUrl: 't', personalDataUrl: 'd' }),
      createPse: jest.fn().mockResolvedValue({ ...tx('PENDING'), payment_method: { extra: { async_payment_url: 'https://banco/pse' } } }),
      transaction: jest.fn(),
      isAuthentic: jest.fn().mockReturnValue(true),
    };
    notifications = { notify: jest.fn() };
    service = new PseService(prisma, wompi, notifications, { get: () => 'https://confiance.app' } as any);
  });

  describe('iniciar', () => {
    it('crea el intento pending con su referencia, la transacción en Wompi y devuelve la URL del banco', async () => {
      await expect(service.start(9n, 30n, dto)).resolves.toEqual({ url: 'https://banco/pse', estado: 'pendiente' });

      const { data } = prisma.payments.create.mock.calls[0][0];
      expect(data).toMatchObject({ amount: '80000', payment_methods: { connect: { method_name: 'pse' } } });
      expect(data.gateway_reference).toMatch(/^CONF-30-[0-9a-f]{12}$/);
      expect(wompi.createPse.mock.calls[0][0]).toMatchObject({
        reference: data.gateway_reference, amountInCents: 8_000_000, bankCode: '1', personType: 0, phone: '3001234567',
        redirectUrl: 'https://confiance.app/cliente/contrataciones/30?pago=pse',
      });
      expect(prisma.payments.update).toHaveBeenCalledWith({ where: { payment_id: 7n }, data: { gateway_transaction_id: 'tx-1' } });
    });

    it('sin llaves, PAYMENTS_UNAVAILABLE; fuera de FINALIZADO o siendo el prestador, no crea nada', async () => {
      wompi.enabled = false;
      expect(await codeOf(service.start(9n, 30n, dto))).toBe('PAYMENTS_UNAVAILABLE');

      wompi.enabled = true;
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      expect(await codeOf(service.start(9n, 30n, dto))).toBe('REQUEST_STATE');
      prisma.service_requests.findUnique.mockResolvedValue(request());
      expect(await codeOf(service.start(2n, 30n, dto))).toBe(404);
      expect(prisma.payments.create).not.toHaveBeenCalled();
    });

    it('si Wompi rechaza los datos, el intento queda rechazado y se puede volver a intentar', async () => {
      wompi.createPse.mockRejectedValue(new WompiError(422, '{"user_legal_id":["inválido"]}'));
      expect(await codeOf(service.start(9n, 30n, dto))).toBe('PAYMENT_GATEWAY');
      expect(prisma.payments.updateMany.mock.calls[0][0]).toMatchObject({ where: { payment_id: 7n }, data: { status_id: 3 } });

      wompi.createPse.mockRejectedValue(new WompiError(503, 'sin respuesta'));
      expect(await codeOf(service.start(9n, 30n, dto))).toBe('PAYMENTS_UNAVAILABLE');
    });
  });

  describe('resultado', () => {
    it('APPROVED por el valor acordado: PAGADO y aviso a las dos partes (y COMPLETADO si ya estaba confirmada)', async () => {
      await expect(service.apply(tx('APPROVED') as any)).resolves.toBe('pagado');
      expect(prisma.payments.update.mock.calls[0][0].data.payment_statuses).toEqual({ connect: { status_name: 'paid' } });
      expect(types()).toEqual([[9n, 'payment_approved'], [2n, 'payment_approved']]);
    });

    it('DECLINED: rechazado con el motivo de Wompi y aviso al cliente', async () => {
      await expect(service.apply({ ...tx('DECLINED'), status_message: 'Fondos insuficientes' } as any)).resolves.toBe('rechazado');
      expect(prisma.payments.update.mock.calls[0][0].data).toMatchObject({
        payment_statuses: { connect: { status_name: 'rejected' } }, failure_reason: 'Fondos insuficientes',
      });
      expect(types()).toEqual([[9n, 'payment_rejected']]);
    });

    it('un APPROVED con otro monto no se da por pagado', async () => {
      await expect(service.apply(tx('APPROVED', 100) as any)).resolves.toBe('rechazado');
      expect(prisma.payments.update.mock.calls[0][0].data.failure_reason).toBe('El monto no coincide con el valor acordado.');
    });

    it('idempotente: un intento ya resuelto o una transacción PENDING no cambian nada', async () => {
      prisma.payments.findUniqueOrThrow.mockResolvedValue(payment('paid'));
      await expect(service.apply(tx('DECLINED') as any)).resolves.toBe('pagado');

      prisma.payments.findUniqueOrThrow.mockResolvedValue(payment());
      await expect(service.apply(tx('PENDING') as any)).resolves.toBe('pendiente');
      expect(prisma.payments.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('el evento solo se aplica con firma válida, del mismo ambiente y de tipo transaction.updated', async () => {
      const event = { event: 'transaction.updated', environment: 'test', data: { transaction: tx('APPROVED') } } as any;

      wompi.isAuthentic.mockReturnValueOnce(false);
      await expect(service.handleEvent(event)).resolves.toEqual({ aplicado: false, motivo: 'firma' });
      await expect(service.handleEvent({ ...event, environment: 'prod' })).resolves.toEqual({ aplicado: false, motivo: 'ambiente' });
      await expect(service.handleEvent(event)).resolves.toEqual({ aplicado: true });
      expect(prisma.payments.update).toHaveBeenCalledTimes(1);
    });

    it('al volver del banco consulta la transacción abierta en Wompi', async () => {
      wompi.transaction.mockResolvedValue(tx('APPROVED'));
      await expect(service.sync(9n, 30n)).resolves.toEqual({ estado: 'pagado' });
      expect(wompi.transaction).toHaveBeenCalledWith('tx-1');

      prisma.payments.findFirst.mockResolvedValue(null);
      await expect(service.sync(9n, 30n)).resolves.toEqual({ estado: null });
    });

    it('barrido: consulta los abiertos y da por fallidos los que nunca llegaron a Wompi', async () => {
      const old = new Date(Date.now() - 20 * 60_000);
      prisma.payments.findMany.mockResolvedValue([
        { payment_id: 7n, gateway_transaction_id: 'tx-1', created_at: old },
        { payment_id: 8n, gateway_transaction_id: null, created_at: old },
      ]);
      wompi.transaction.mockResolvedValue(tx('APPROVED'));

      await expect(service.syncPending()).resolves.toBe(2);
      expect(prisma.payments.updateMany.mock.calls[0][0].where.payment_id).toBe(8n);
    });
  });
});
