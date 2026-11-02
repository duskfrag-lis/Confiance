import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExecutionService } from './execution.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const STATUS_IDS: Record<string, number> = { en_curso: 4, finalizado: 5 };

describe('E9 ExecutionService', () => {
  let prisma: any;
  let notifications: any;
  let service: ExecutionService;

  const request = (state = 'confirmado') => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: null,
    proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });

  const types = () => notifications.notify.mock.calls[0][0].map((n: { userId: bigint; type: string }) => [n.userId, n.type]);

  beforeEach(() => {
    prisma = {
      request_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ request_status_id: STATUS_IDS[where.status_name] })),
      },
      service_requests: {
        findUnique: jest.fn().mockResolvedValue(request()),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ request_statuses: { status_name: 'finalizado' } }),
        findMany: jest.fn().mockResolvedValue([request()]),
        update: jest.fn(),
      },
      completion_confirmations: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      issue_reports: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new ExecutionService(prisma, notifications);
  });

  describe('HU-46 inicio', () => {
    it('el prestador lo marca en CONFIRMADO: pasa a EN_CURSO y se avisa al cliente', async () => {
      await expect(service.start(2n, 30n)).resolves.toMatchObject({ id: '30', estado: 'en_curso' });

      expect(prisma.service_requests.update.mock.calls[0][0].data).toEqual({ request_statuses: { connect: { request_status_id: 4 } } });
      expect(types()).toEqual([[9n, 'service_started']]);
    });

    it('fuera de CONFIRMADO, REQUEST_STATE; el cliente u otro usuario, 404', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('aceptado'));
      expect(await codeOf(service.start(2n, 30n))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request());
      expect(await codeOf(service.start(9n, 30n))).toBe(404);
      expect(await codeOf(service.start(77n, 30n))).toBe(404);
      expect(prisma.service_requests.update).not.toHaveBeenCalled();
    });

    it('fija el actor de la trazabilidad y bloquea la contratación', async () => {
      await service.start(2n, 30n);

      expect(prisma.$queryRaw.mock.calls[0][1]).toBe('2');
    });
  });

  describe('HU-47 finalización', () => {
    it('el prestador lo marca en EN_CURSO: pasa a FINALIZADO y se pide la confirmación al cliente', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));

      await expect(service.finish(2n, 30n)).resolves.toMatchObject({ estado: 'finalizado' });
      expect(types()).toEqual([[9n, 'completion_requested']]);
    });

    it('no se finaliza sin haber iniciado', async () => {
      expect(await codeOf(service.finish(2n, 30n))).toBe('REQUEST_STATE');
    });

    it('el cliente confirma (manual); sin pago sigue en FINALIZADO y se avisa al prestador', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));

      await expect(service.confirmCompletion(9n, 30n)).resolves.toMatchObject({ estado: 'finalizado' });
      expect(prisma.completion_confirmations.create).toHaveBeenCalledWith({
        data: { service_request_id: 30n, confirmed_by: 9n, is_automatic: false },
      });
      expect(types()).toEqual([[2n, 'completion_confirmed']]);
    });

    it('HU-47.5: con el pago hecho, la base la completa y se avisa a las dos partes', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));
      prisma.service_requests.findUniqueOrThrow.mockResolvedValue({ request_statuses: { status_name: 'completado' } });

      await expect(service.confirmCompletion(9n, 30n)).resolves.toMatchObject({ estado: 'completado' });
      expect(types()).toEqual([[2n, 'completion_confirmed'], [9n, 'request_completed'], [2n, 'request_completed']]);
    });

    it('una sola confirmación por cliente; solo en FINALIZADO; el prestador no confirma', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));
      prisma.completion_confirmations.count.mockResolvedValue(1);
      expect(await codeOf(service.confirmCompletion(9n, 30n))).toBe('COMPLETION_CONFIRMED');

      prisma.completion_confirmations.count.mockResolvedValue(0);
      prisma.completion_confirmations.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'x' }),
      );
      expect(await codeOf(service.confirmCompletion(9n, 30n))).toBe('COMPLETION_CONFIRMED');

      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      expect(await codeOf(service.confirmCompletion(9n, 30n))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));
      expect(await codeOf(service.confirmCompletion(2n, 30n))).toBe(404);
    });
  });

  describe('HU-48 reporte', () => {
    it('cualquiera de las partes en FINALIZADO o COMPLETADO; queda quién lo reportó', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));
      await service.report(9n, 30n, { descripcion: 'Sigue goteando' });

      prisma.service_requests.findUnique.mockResolvedValue(request('completado'));
      await service.report(2n, 30n, { descripcion: 'El cliente no estaba' });

      expect(prisma.issue_reports.create.mock.calls.map((c: any[]) => c[0].data)).toEqual([
        { service_request_id: 30n, reported_by: 9n, description: 'Sigue goteando' },
        { service_request_id: 30n, reported_by: 2n, description: 'El cliente no estaba' },
      ]);
    });

    it('antes de FINALIZADO, REQUEST_STATE; quien no es parte, 404', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      expect(await codeOf(service.report(9n, 30n, { descripcion: 'x' }))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));
      expect(await codeOf(service.report(77n, 30n, { descripcion: 'x' }))).toBe(404);
      expect(prisma.issue_reports.create).not.toHaveBeenCalled();
    });
  });

  describe('proceso programado', () => {
    it('HU-47.3: confirmación automática; avisa a las dos partes y, si quedó completada, también eso', async () => {
      prisma.$queryRaw.mockResolvedValue([{ confirmed_request_id: 30n, completed: true }]);

      await expect(service.autoConfirm()).resolves.toBe(1);
      expect(types()).toEqual([
        [9n, 'completion_confirmed'], [2n, 'completion_confirmed'], [9n, 'request_completed'], [2n, 'request_completed'],
      ]);
    });

    it('sin nada vencido no avisa', async () => {
      await expect(service.autoConfirm()).resolves.toBe(0);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('HU-46.3: recuerda al prestador una sola vez si llegó la hora y sigue en CONFIRMADO', async () => {
      await expect(service.remindStart()).resolves.toBe(1);

      expect(prisma.service_requests.findMany.mock.calls[0][0].where).toMatchObject({
        request_statuses: { status_name: 'confirmado' },
        notifications: { none: { notification_types: { type_name: 'service_start_reminder' } } },
      });
      expect(types()).toEqual([[2n, 'service_start_reminder']]);
    });
  });
});
