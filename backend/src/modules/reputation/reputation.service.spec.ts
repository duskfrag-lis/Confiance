import { HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReputationService } from './reputation.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('E10 ReputationService (HU-49)', () => {
  let prisma: any;
  let service: ReputationService;

  // Cliente 9 y prestador con usuario 2; el usuario 7 no es parte
  const request = (state = 'completado') => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_need_id: null,
    proposed_datetime: new Date('2026-10-26T14:00:00Z'), agreed_price: '80000', request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz' } },
    users: { first_name: 'Laura', last_name: 'Gómez' },
    service_listings: { title: 'Instalación de lámparas' }, needs: null,
  });

  const saved = () => prisma.ratings.create.mock.calls[0][0].data;

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()) },
      ratings: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new ReputationService(prisma);
  });

  it('el cliente califica al prestador y el prestador al cliente (HU-49.2)', async () => {
    await expect(service.rate(9n, 30n, { puntaje: 5, comentario: 'Excelente' })).resolves.toMatchObject({ id: '30', estado: 'completado' });
    expect(saved()).toEqual({ service_request_id: 30n, rated_by: 9n, rated_user_id: 2n, score: 5, comment: 'Excelente' });

    prisma.ratings.create.mockClear();
    await service.rate(2n, 30n, { puntaje: 4 });
    expect(saved()).toEqual({ service_request_id: 30n, rated_by: 2n, rated_user_id: 9n, score: 4, comment: null });
  });

  it('fuera de COMPLETADO, REQUEST_STATE y no se guarda nada (HU-49.1)', async () => {
    prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));

    expect(await codeOf(service.rate(9n, 30n, { puntaje: 5 }))).toBe('REQUEST_STATE');
    expect(prisma.ratings.create).not.toHaveBeenCalled();
  });

  it('quien no es parte recibe 404', async () => {
    await expect(service.rate(7n, 30n, { puntaje: 5 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('la segunda calificación de la misma persona da ALREADY_RATED (HU-49.2)', async () => {
    prisma.ratings.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    expect(await codeOf(service.rate(9n, 30n, { puntaje: 5 }))).toBe('ALREADY_RATED');
  });

  it('si la base la frena porque cambió el estado, también REQUEST_STATE', async () => {
    prisma.ratings.create.mockRejectedValue(new Error('Solo se puede calificar una contratación COMPLETADA (service_request_id = 30, estado = finalizado)'));

    expect(await codeOf(service.rate(9n, 30n, { puntaje: 5 }))).toBe('REQUEST_STATE');
  });
});
