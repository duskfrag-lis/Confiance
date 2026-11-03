import { HttpException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('E9 PaymentsService', () => {
  let prisma: any;
  let notifications: any;
  let service: PaymentsService;

  const request = (state = 'finalizado') => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: null,
    proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });

  const types = () => notifications.notify.mock.calls[0][0].map((n: { userId: bigint; type: string }) => [n.userId, n.type]);

  beforeEach(() => {
    prisma = {
      service_requests: {
        findUnique: jest.fn().mockResolvedValue(request()),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ request_statuses: { status_name: 'finalizado' } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payments: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ payment_id: 7n }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new PaymentsService(prisma, { publicUrl: (k: string | null) => k } as any, notifications);
  });

  describe('HU-44 transferencia', () => {
    it('el cliente la marca en FINALIZADO por el valor acordado y se avisa al prestador', async () => {
      await expect(service.markTransfer(9n, 30n)).resolves.toMatchObject({ id: '30', estado: 'finalizado' });

      expect(prisma.payments.create.mock.calls[0][0].data).toMatchObject({
        amount: '80000',
        payment_methods: { connect: { method_name: 'bank_transfer' } },
        payment_statuses: { connect: { status_name: 'pending_confirmation' } },
      });
      expect(types()).toEqual([[2n, 'transfer_marked']]);
    });

    it('fuera de FINALIZADO, REQUEST_STATE; el prestador no la marca', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      expect(await codeOf(service.markTransfer(9n, 30n))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request());
      expect(await codeOf(service.markTransfer(2n, 30n))).toBe(404);
      expect(prisma.payments.create).not.toHaveBeenCalled();
    });

    it('las reglas de la base salen con su código', async () => {
      const rule = (message: string) => prisma.payments.create.mockRejectedValueOnce(new Error(message));

      rule('Ya hay un pago en curso para esta contratación (service_request_id = 30)');
      expect(await codeOf(service.markTransfer(9n, 30n))).toBe('PAYMENT_IN_PROGRESS');
      rule('La contratación ya está pagada (service_request_id = 30)');
      expect(await codeOf(service.markTransfer(9n, 30n))).toBe('PAYMENT_DONE');
      rule('El prestador no tiene información bancaria; solo se puede pagar por PSE (service_request_id = 30)');
      expect(await codeOf(service.markTransfer(9n, 30n))).toBe('NO_BANK_ACCOUNT');
    });

    it('el prestador confirma que llegó: queda PAGADO y, si ya estaba confirmada, se completa', async () => {
      prisma.service_requests.findUniqueOrThrow.mockResolvedValue({ request_statuses: { status_name: 'completado' } });

      await expect(service.confirmTransfer(2n, 30n, true)).resolves.toMatchObject({ estado: 'completado' });
      expect(prisma.payments.update).toHaveBeenCalledWith({
        where: { payment_id: 7n },
        data: { payment_statuses: { connect: { status_name: 'paid' } }, failure_reason: null },
      });
      expect(types()).toEqual([[9n, 'transfer_confirmed'], [9n, 'request_completed'], [2n, 'request_completed']]);
    });

    it('si no llegó, el intento queda rechazado con el motivo y se avisa al cliente', async () => {
      await expect(service.confirmTransfer(2n, 30n, false)).resolves.toMatchObject({ estado: 'finalizado' });
      expect(prisma.payments.update.mock.calls[0][0].data.payment_statuses).toEqual({ connect: { status_name: 'rejected' } });
      expect(types()).toEqual([[9n, 'transfer_not_received']]);
    });

    it('sin transferencia marcada, REQUEST_STATE; el cliente no confirma', async () => {
      prisma.payments.findFirst.mockResolvedValue(null);
      expect(await codeOf(service.confirmTransfer(2n, 30n, true))).toBe('REQUEST_STATE');
      expect(await codeOf(service.confirmTransfer(9n, 30n, true))).toBe(404);
      expect(prisma.payments.update).not.toHaveBeenCalled();
    });
  });

  describe('HU-45 consulta', () => {
    const row = (id: bigint, client: bigint, payments: unknown[], finished: string) => ({
      service_request_id: id, client_id: client, agreed_price: '50000',
      proposed_datetime: new Date(finished), completion_requested_at: new Date(finished),
      users: { first_name: 'Laura', last_name: 'Gómez', profile_photo_url: null },
      provider_profiles: { users: { first_name: 'Ana', last_name: 'Ruiz', profile_photo_url: 'a.jpg' } },
      service_listings: { title: 'Pintura' }, needs: null, payments,
    });
    const attempt = (status: string, method = 'pse', paidAt: string | null = null) => ({
      paid_at: paidAt ? new Date(paidAt) : null,
      payment_statuses: { status_name: status }, payment_methods: { method_name: method },
    });

    it('estado, método, rechazos y la otra parte según quién consulta; lo más reciente primero', async () => {
      prisma.service_requests.findMany.mockResolvedValue([
        row(1n, 9n, [attempt('rejected'), attempt('paid', 'pse', '2026-10-28T10:00:00Z')], '2026-10-27T10:00:00Z'),
        row(2n, 5n, [attempt('pending_confirmation', 'bank_transfer')], '2026-10-29T10:00:00Z'),
      ]);

      const list = await service.mine(9n);

      expect(list.map((p) => [p.contratacionId, p.estado, p.metodo, p.intentosRechazados])).toEqual([
        ['2', 'pendiente_confirmacion', 'transferencia', 0],
        ['1', 'pagado', 'pse', 1],
      ]);
      expect(list[1].contraparte).toEqual({ nombre: 'Ana Ruiz', fotoUrl: 'a.jpg' });
      expect(list[0].contraparte.nombre).toBe('Laura Gómez');
    });
  });
});
