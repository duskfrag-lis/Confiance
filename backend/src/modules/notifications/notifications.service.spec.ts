import { NotificationsService } from './notifications.service';

describe('E15 NotificationsService', () => {
  let prisma: any;
  let service: NotificationsService;

  const client = { userId: 9n, activeProfile: 'client' } as any;
  const provider = { userId: 9n, activeProfile: 'provider' } as any;

  const row = (over: Record<string, unknown> = {}) => ({
    notification_id: 41n,
    message: 'Ana Ruiz te envió una solicitud para "Instalación de lámparas".',
    is_read: false,
    created_at: new Date('2026-10-24T15:00:00Z'),
    related_service_request_id: 30n,
    related_need_id: null,
    notification_types: { type_name: 'request_received' },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      notifications: {
        findMany: jest.fn().mockResolvedValue([row()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn(),
      },
      notification_types: { findMany: jest.fn().mockResolvedValue([{ type_name: 'interest_received', notification_type_id: 1 }]) },
    };
    service = new NotificationsService(prisma);
  });

  it('HU-62.2: la bandeja, de la más reciente a la más antigua, con título y tema según el tipo', async () => {
    const [n] = await service.list(provider);

    expect(prisma.notifications.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
      take: 100,
    });
    expect(n).toEqual({
      id: '41', tipo: 'solicitud', titulo: 'Nueva solicitud de servicio',
      mensaje: 'Ana Ruiz te envió una solicitud para "Instalación de lámparas".',
      fecha: '2026-10-24T15:00:00.000Z', leida: false, contratacionId: '30', necesidadId: null,
    });
  });

  it('HU-62.3: un aviso de interés lleva a su necesidad', async () => {
    prisma.notifications.findMany.mockResolvedValue([
      row({ related_service_request_id: null, related_need_id: 12n, notification_types: { type_name: 'interest_received' } }),
    ]);

    const [n] = await service.list(client);

    expect(n).toMatchObject({ tipo: 'interes', titulo: 'Nuevo interés en tu necesidad', contratacionId: null, necesidadId: '12' });
  });

  it('por perfil: el cliente ve su lado de las contrataciones, sus necesidades y los de la cuenta (sin verificación)', async () => {
    await service.list(client);

    expect(prisma.notifications.findMany.mock.calls[0][0].where).toEqual({
      user_id: 9n,
      OR: [
        { service_requests: { client_id: 9n } },
        { related_service_request_id: null, needs: { client_id: 9n } },
        { related_service_request_id: null, related_need_id: null, notification_types: { type_name: { notIn: ['verification_result'] } } },
      ],
    });
  });

  it('por perfil: el prestador ve su lado, las necesidades de otros en las que se interesó y los de la cuenta', async () => {
    await service.list(provider);

    expect(prisma.notifications.findMany.mock.calls[0][0].where).toEqual({
      user_id: 9n,
      OR: [
        { service_requests: { provider_profiles: { user_id: 9n } } },
        { related_service_request_id: null, needs: { client_id: { not: 9n } } },
        { related_service_request_id: null, related_need_id: null },
      ],
    });
  });

  it('HU-62.3: marca una propia como leída o no leída', async () => {
    await expect(service.setRead(9n, 41n, false)).resolves.toEqual({ id: '41', leida: false });

    expect(prisma.notifications.updateMany).toHaveBeenCalledWith({
      where: { notification_id: 41n, user_id: 9n },
      data: { is_read: false },
    });
  });

  it('HU-62.3: la notificación de otra persona responde 404', async () => {
    prisma.notifications.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.setRead(9n, 41n, true)).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOTIFICATION_NOT_FOUND' },
    });
  });

  it('HU-62.3: marcar todas solo toca las no leídas del perfil activo', async () => {
    prisma.notifications.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.readAll(client)).resolves.toEqual({ actualizadas: 3 });

    const { where, data } = prisma.notifications.updateMany.mock.calls[0][0];
    expect(data).toEqual({ is_read: true });
    expect(where.AND[1]).toEqual({ is_read: false });
    expect(where.AND[0].user_id).toBe(9n);
  });

  it('notify guarda la necesidad del aviso', async () => {
    await service.notify([{ userId: 5n, type: 'interest_received', message: 'Un prestador mostró interés.', needId: 12n }]);

    expect(prisma.notifications.createMany).toHaveBeenCalledWith({
      data: [{ user_id: 5n, notification_type_id: 1, message: 'Un prestador mostró interés.', related_service_request_id: null, related_need_id: 12n }],
    });
  });
});
