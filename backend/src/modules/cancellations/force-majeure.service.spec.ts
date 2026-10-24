import { HttpException, NotFoundException } from '@nestjs/common';
import { ForceMajeureService } from './force-majeure.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('HU-59 ForceMajeureService', () => {
  let prisma: any;
  let notifications: any;
  let service: ForceMajeureService;

  // Cliente 9 (Laura) y prestador con usuario 2 (Ana); el administrador es el 1
  const cancellation = (status = 'pending', extra: object = {}) => ({
    service_request_id: 30n, cancelled_by: 2n, reason: 'Me hospitalizaron.', evidence_url: 'private/force-majeure/a.pdf',
    created_at: new Date('2026-10-24T15:00:00Z'), is_force_majeure: true, force_majeure_statuses: { status_name: status },
    service_requests: {
      client_id: 9n, proposed_datetime: new Date('2026-10-26T14:00:00Z'),
      users: { first_name: 'Laura', last_name: 'Gómez' },
      provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
      service_listings: { title: 'Instalación de lámparas' }, needs: null,
    },
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      cancellations: {
        findMany: jest.fn().mockResolvedValue([cancellation()]),
        findUnique: jest.fn().mockResolvedValue(cancellation()),
        update: jest.fn().mockResolvedValue({ force_majeure_reviewed_at: new Date('2026-10-24T18:00:00Z') }),
      },
      audit_events: { findMany: jest.fn().mockResolvedValue([{ entity_id: 30n, previous_state: 'en_curso' }]) },
      force_majeure_statuses: { findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ force_majeure_status_id: where.status_name === 'approved' ? 2 : 3 })) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new ForceMajeureService(prisma, { signedUrl: (k: string) => `firmado:${k}` } as never, notifications);
  });

  it('lista las pendientes con motivo, evidencia firmada, las partes y el estado al cancelar (HU-59.1)', async () => {
    await expect(service.pending()).resolves.toEqual([{
      contratacionId: '30', servicio: 'Instalación de lámparas',
      canceladoPor: { nombre: 'Ana Ruiz', rol: 'prestador' }, contraparte: { nombre: 'Laura Gómez', rol: 'cliente' },
      motivo: 'Me hospitalizaron.', evidencia: { nombre: 'evidencia.pdf', url: 'firmado:private/force-majeure/a.pdf' },
      cancelada: '2026-10-24T15:00:00.000Z', fechaServicio: '2026-10-26T14:00:00.000Z', estadoAlCancelar: 'en_curso',
    }]);
  });

  it('aprobar guarda el resultado, el administrador y la fecha, y avisa a quien canceló (HU-59.2, HU-59.3)', async () => {
    await expect(service.review(1n, 30n, { decision: 'aprobada' })).resolves.toEqual({
      contratacionId: '30', evaluacion: 'aprobada', fecha: '2026-10-24T18:00:00.000Z',
    });

    const { data } = prisma.cancellations.update.mock.calls[0][0];
    expect(data).toMatchObject({ force_majeure_status_id: 2, force_majeure_reviewed_by: 1n });
    expect(data.force_majeure_reviewed_at).toBeInstanceOf(Date);
    expect(notifications.notify.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2n, type: 'force_majeure_result' })]);
  });

  it('ya evaluada, FORCE_MAJEURE_REVIEWED; siendo parte, OWN_CANCELLATION; sin fuerza mayor, 404', async () => {
    prisma.cancellations.findUnique.mockResolvedValue(cancellation('approved'));
    expect(await codeOf(service.review(1n, 30n, { decision: 'rechazada' }))).toBe('FORCE_MAJEURE_REVIEWED');

    prisma.cancellations.findUnique.mockResolvedValue(cancellation());
    expect(await codeOf(service.review(9n, 30n, { decision: 'rechazada' }))).toBe('OWN_CANCELLATION');

    prisma.cancellations.findUnique.mockResolvedValue(cancellation('pending', { is_force_majeure: false }));
    await expect(service.review(1n, 30n, { decision: 'rechazada' })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.cancellations.update).not.toHaveBeenCalled();
  });
});
