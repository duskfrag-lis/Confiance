import { HttpException } from '@nestjs/common';
import { CancellationsService } from './cancellations.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

describe('E11 CancellationsService', () => {
  let prisma: any;
  let storage: any;
  let notifications: any;
  let service: CancellationsService;

  const request = (state = 'confirmado', needId: bigint | null = null) => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: needId,
    proposed_datetime: inHours(72), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });

  const evidence = { buffer: Buffer.from('%PDF-1.7'), size: 8 };
  const notice = () => notifications.notify.mock.calls[0][0][0];

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()) },
      appointments: { findUnique: jest.fn().mockResolvedValue({ scheduled_datetime: inHours(72) }) },
      force_majeure_statuses: { findUniqueOrThrow: jest.fn().mockResolvedValue({ force_majeure_status_id: 1 }) },
      reschedule_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ reschedule_status_id: { pending: 1, accepted: 2, rejected: 3 }[where.status_name as string] })),
      },
      cancellations: { create: jest.fn() },
      appointment_reschedule_requests: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    storage = { uploadPrivateEvidence: jest.fn().mockResolvedValue('private/force-majeure/x.pdf'), remove: jest.fn() };
    notifications = { notify: jest.fn() };
    service = new CancellationsService(prisma, storage, notifications);
  });

  describe('HU-50 cancelación ordinaria', () => {
    it('con más de 24 h: queda el actor y el motivo, y se avisa a la otra parte', async () => {
      await expect(service.cancel(9n, 30n, { motivo: 'Me surgió un viaje' })).resolves.toMatchObject({ estado: 'cancelado' });

      expect(prisma.cancellations.create).toHaveBeenCalledWith({
        data: {
          service_request_id: 30n, cancelled_by: 9n, reason: 'Me surgió un viaje', is_force_majeure: false,
          evidence_url: null, force_majeure_status_id: null,
        },
      });
      expect(notice()).toMatchObject({ userId: 2n, type: 'request_cancelled', serviceRequestId: 30n });
      expect(notice().message).toContain('Motivo: Me surgió un viaje');
    });

    it('HU-50.2: con 24 h o menos para la cita, CANCEL_NOTICE (se mira la cita, no la fecha propuesta)', async () => {
      prisma.appointments.findUnique.mockResolvedValue({ scheduled_datetime: inHours(23) });

      expect(await codeOf(service.cancel(9n, 30n, { motivo: 'x' }))).toBe('CANCEL_NOTICE');
      expect(prisma.cancellations.create).not.toHaveBeenCalled();
    });

    it('sin cita (SOLICITADO) usa la fecha propuesta', async () => {
      prisma.service_requests.findUnique.mockResolvedValue({ ...request('solicitado'), proposed_datetime: inHours(10) });
      prisma.appointments.findUnique.mockResolvedValue(null);

      expect(await codeOf(service.cancel(2n, 30n, { motivo: 'x' }))).toBe('CANCEL_NOTICE');
    });

    it('HU-50.3: no en EN_CURSO; quien no es parte, 404', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      expect(await codeOf(service.cancel(9n, 30n, { motivo: 'x' }))).toBe('REQUEST_STATE');

      prisma.service_requests.findUnique.mockResolvedValue(request());
      expect(await codeOf(service.cancel(77n, 30n, { motivo: 'x' }))).toBe(404);
    });

    it('si cancela el prestador una que venía de una necesidad, el cliente sabe que se reabrió', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('confirmado', 5n));

      await service.cancel(2n, 30n, { motivo: 'Enfermedad' });

      expect(notice().userId).toBe(9n);
      expect(notice().message).toContain('Tu necesidad volvió a quedar abierta.');
    });

    it('la evidencia solo va con fuerza mayor', async () => {
      expect(await codeOf(service.cancel(9n, 30n, { motivo: 'x' }, evidence))).toBe('EVIDENCE_NOT_ALLOWED');
      expect(storage.uploadPrivateEvidence).not.toHaveBeenCalled();
    });
  });

  describe('HU-51 fuerza mayor', () => {
    it('sin las 24 h y en EN_CURSO; evaluación pendiente y evidencia privada', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('en_curso'));
      prisma.appointments.findUnique.mockResolvedValue({ scheduled_datetime: inHours(-1) });

      await service.cancel(2n, 30n, { motivo: 'Accidente', fuerzaMayor: true }, evidence);

      expect(storage.uploadPrivateEvidence).toHaveBeenCalledWith('force-majeure', evidence);
      expect(prisma.cancellations.create.mock.calls[0][0].data).toMatchObject({
        is_force_majeure: true, evidence_url: 'private/force-majeure/x.pdf', force_majeure_status_id: 1,
      });
      expect(notice().message).toContain('por fuerza mayor');
    });

    it('HU-51.2: no desde FINALIZADO (va por reclamo); la evidencia subida se borra', async () => {
      prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));

      expect(await codeOf(service.cancel(9n, 30n, { motivo: 'x', fuerzaMayor: true }, evidence))).toBe('REQUEST_STATE');
      expect(storage.remove).toHaveBeenCalledWith('private/force-majeure/x.pdf');
    });

    it('si la base frena la cancelación por las 24 h, se traduce a CANCEL_NOTICE', async () => {
      prisma.cancellations.create.mockRejectedValue(new Error('La cancelación ordinaria solo se permite hasta 24h antes de la fecha programada'));

      expect(await codeOf(service.cancel(9n, 30n, { motivo: 'x' }))).toBe('CANCEL_NOTICE');
    });
  });

  describe('HU-53 reagendamiento', () => {
    const proposal = (by = 2n, at = inHours(96)) => ({
      reschedule_request_id: 7n, requested_by: by, new_datetime: at, previous_datetime: inHours(72),
    });

    it('cualquiera de las partes propone; pendiente, y se avisa a la otra', async () => {
      const at = inHours(96);

      await expect(service.reschedule(2n, 30n, { fechaHora: at.toISOString() })).resolves.toMatchObject({ estado: 'confirmado' });
      expect(prisma.appointment_reschedule_requests.create.mock.calls[0][0].data).toMatchObject({
        service_request_id: 30n, requested_by: 2n, new_datetime: at, status_id: 1,
      });
      expect(notice()).toMatchObject({ userId: 9n, type: 'reschedule_requested' });
    });

    it('HU-53.1: también dentro de las últimas 24 h', async () => {
      prisma.appointments.findUnique.mockResolvedValue({ scheduled_datetime: inHours(5) });

      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('sin error');
    });

    it('HU-53.2 y HU-53.4: fecha pasada, igual a la actual, otra pendiente, máximo 2, otro estado', async () => {
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(-1).toISOString() }))).toBe('PAST_DATE');

      const current = inHours(72);
      prisma.appointments.findUnique.mockResolvedValue({ scheduled_datetime: current });
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: current.toISOString() }))).toBe('SAME_DATE');

      const status = (s: string) => ({ reschedule_statuses: { status_name: s } });
      prisma.appointment_reschedule_requests.findMany.mockResolvedValue([status('pending')]);
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('RESCHEDULE_PENDING');

      prisma.appointment_reschedule_requests.findMany.mockResolvedValue([status('rejected'), status('accepted')]);
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('RESCHEDULE_LIMIT');

      prisma.service_requests.findUnique.mockResolvedValue(request('solicitado'));
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('REQUEST_STATE');
    });

    it('la disponibilidad y el choque los revisa la base; se traducen', async () => {
      prisma.appointment_reschedule_requests.create.mockRejectedValueOnce(new Error('El horario x está fuera de la disponibilidad del prestador'));
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('OUTSIDE_AVAILABILITY');

      prisma.appointment_reschedule_requests.create.mockRejectedValueOnce(new Error('El prestador ya tiene una contratación aceptada en ese día y bloque horario'));
      expect(await codeOf(service.reschedule(9n, 30n, { fechaHora: inHours(96).toISOString() }))).toBe('SLOT_TAKEN');
    });

    it('HU-53.3: la otra parte acepta y se avisa a quien la pidió con la fecha nueva', async () => {
      const at = inHours(96);
      prisma.appointment_reschedule_requests.findFirst.mockResolvedValue(proposal(2n, at));

      await expect(service.respond(9n, 30n, { aceptar: true })).resolves.toMatchObject({ fechaHora: at.toISOString() });
      expect(prisma.appointment_reschedule_requests.update).toHaveBeenCalledWith({ where: { reschedule_request_id: 7n }, data: { status_id: 2 } });
      expect(notice()).toMatchObject({ userId: 2n, type: 'reschedule_answered' });
      expect(notice().message).toContain('aceptó');
    });

    it('HU-53.3: si rechaza se mantiene la anterior', async () => {
      const p = proposal();
      prisma.appointment_reschedule_requests.findFirst.mockResolvedValue(p);

      await expect(service.respond(9n, 30n, { aceptar: false })).resolves.toMatchObject({ fechaHora: p.previous_datetime.toISOString() });
      expect(prisma.appointment_reschedule_requests.update.mock.calls[0][0].data).toEqual({ status_id: 3 });
      expect(notice().message).toContain('rechazó');
    });

    it('no responde quien la pidió; sin pendiente; no se acepta una fecha que ya pasó', async () => {
      prisma.appointment_reschedule_requests.findFirst.mockResolvedValue(proposal(9n));
      expect(await codeOf(service.respond(9n, 30n, { aceptar: true }))).toBe('RESCHEDULE_OWN');

      prisma.appointment_reschedule_requests.findFirst.mockResolvedValue(null);
      expect(await codeOf(service.respond(9n, 30n, { aceptar: true }))).toBe('RESCHEDULE_NONE');

      prisma.appointment_reschedule_requests.findFirst.mockResolvedValue(proposal(2n, inHours(-1)));
      expect(await codeOf(service.respond(9n, 30n, { aceptar: true }))).toBe('PAST_DATE');
      expect(prisma.appointment_reschedule_requests.update).not.toHaveBeenCalled();
    });
  });
});
