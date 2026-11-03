import { HttpException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { ChatService } from './chat.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const user = (userId: bigint, activeProfile: AuthUser['activeProfile']): AuthUser =>
  ({ userId, sessionId: 1n, activeProfile, isAdmin: false });

describe('E7 ChatService', () => {
  let prisma: any;
  let notifications: any;
  let storage: any;
  let service: ChatService;

  // Cliente 9n, prestador 2n (perfil de prestador 5n)
  const request = (state = 'aceptado') => ({
    client_id: 9n,
    provider_profiles: { user_id: 2n },
    request_statuses: { status_name: state },
    service_listings: { title: 'Instalación de lámparas' },
    needs: null,
  });

  const message = (id: bigint, sender = 9n) => ({
    message_id: id, sender_id: sender, message_text: `hola ${id}`, sent_at: new Date('2026-10-22T15:00:00Z'),
  });

  const listRow = (id: bigint, state = 'aceptado') => ({
    service_request_id: id,
    client_id: 9n,
    provider_profile_id: 5n,
    proposed_datetime: new Date('2026-11-10T14:00:00Z'),
    request_statuses: { status_name: state },
    provider_profiles: { users: { first_name: 'Ana', last_name: 'Ríos', profile_photo_url: null } },
    users: { first_name: 'Luis', last_name: 'Gómez', profile_photo_url: 'public/luis.jpg' },
    service_listings: { title: `Servicio ${id}` },
    needs: null,
    appointments: null,
  });

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()), findMany: jest.fn().mockResolvedValue([]) },
      chat_messages: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(message(51n)) },
      chat_reads: { findUnique: jest.fn().mockResolvedValue(null) },
      notifications: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn(),
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    storage = { publicUrl: jest.fn((key: string | null) => (key ? `https://cdn/${key}` : null)) };
    service = new ChatService(prisma, notifications, storage);
  });

  it('HU-42: quien no es parte no ve ni escribe en el chat (404, sin revelar que existe)', async () => {
    expect(await codeOf(service.thread(77n, 30n))).toBe(404);
    expect(await codeOf(service.send(77n, 30n, 'hola'))).toBe(404);
    expect(await codeOf(service.markRead(77n, 30n))).toBe(404);
  });

  it('HU-42: conversación de lo más viejo a lo más nuevo, con "mio" según quien pide y el visto de la otra parte', async () => {
    prisma.chat_messages.findMany.mockResolvedValue([message(53n), message(52n, 2n)]);
    prisma.chat_reads.findUnique.mockResolvedValue({ last_read_at: new Date('2026-10-22T15:05:00Z') });

    const thread = await service.thread(9n, 30n);

    expect(prisma.chat_messages.findMany.mock.calls[0][0]).toMatchObject({ where: { service_request_id: 30n }, orderBy: { message_id: 'desc' } });
    expect(prisma.chat_reads.findUnique.mock.calls[0][0].where).toEqual({ service_request_id_user_id: { service_request_id: 30n, user_id: 2n } });
    expect(thread).toEqual({
      soloLectura: false,
      mensajes: [
        { id: '52', texto: 'hola 52', fecha: '2026-10-22T15:00:00.000Z', mio: false },
        { id: '53', texto: 'hola 53', fecha: '2026-10-22T15:00:00.000Z', mio: true },
      ],
      leidoPorContraparte: '2026-10-22T15:05:00.000Z',
    });
  });

  it('HU-42: envía, guarda, marca leído para quien escribe y avisa a la otra parte', async () => {
    const sent = await service.send(9n, 30n, 'hola');

    expect(prisma.chat_messages.create.mock.calls[0][0].data).toEqual({ service_request_id: 30n, sender_id: 9n, message_text: 'hola' });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: 2n, type: 'new_chat_message', serviceRequestId: 30n })],
      prisma,
    );
    expect(sent).toEqual({ id: '51', texto: 'hola 51', fecha: '2026-10-22T15:00:00.000Z', mio: true });
  });

  it('HU-62: no repite el aviso si la otra parte ya tiene uno sin leer de este chat', async () => {
    prisma.notifications.findFirst.mockResolvedValue({ notification_id: 1n });

    await service.send(2n, 30n, 'otra vez');

    expect(prisma.notifications.findFirst.mock.calls[0][0].where).toMatchObject({ user_id: 9n, is_read: false });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('HU-62: al leer, avanza lo leído y el aviso de mensajes nuevos de ese chat queda leído', async () => {
    await service.markRead(2n, 30n);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.notifications.updateMany.mock.calls[0][0]).toMatchObject({
      where: { user_id: 2n, related_service_request_id: 30n, is_read: false, notification_types: { type_name: 'new_chat_message' } },
      data: { is_read: true },
    });
  });

  it.each(['rechazado', 'cancelado', 'completado'])('D-53: en %s el chat es de solo lectura', async (state) => {
    prisma.service_requests.findUnique.mockResolvedValue(request(state));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('CHAT_READ_ONLY');
    expect(prisma.chat_messages.create).not.toHaveBeenCalled();
    expect((await service.thread(9n, 30n)).soloLectura).toBe(true);
  });

  it('D-53: si el estado cambia justo antes de guardar, la base lo frena y sale el mismo error', async () => {
    prisma.chat_messages.create.mockRejectedValue(new Error('El chat de una contratación CANCELADO es de solo lectura (service_request_id = 30)'));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('CHAT_READ_ONLY');
  });

  it('D-53: en FINALIZADO todavía se puede escribir', async () => {
    prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('sin error');
  });

  it('HU-42: sin contrataciones, la lista sale vacía sin más consultas', async () => {
    expect(await service.mine(user(9n, 'client'))).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('HU-42: mis chats del perfil activo, con el último mensaje y los sin leer; primero los que tienen mensajes', async () => {
    prisma.service_requests.findMany.mockResolvedValue([listRow(30n), listRow(31n, 'completado')]);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ service_request_id: 31n, sender_id: 2n, message_text: 'Listo', sent_at: new Date('2026-10-23T10:00:00Z') }])
      .mockResolvedValueOnce([{ service_request_id: 31n, total: 3 }]);

    const asClient = await service.mine(user(9n, 'client'));

    expect(prisma.service_requests.findMany.mock.calls[0][0].where).toEqual({ client_id: 9n });
    expect(asClient.map((c) => c.contratacionId)).toEqual(['31', '30']);
    expect(asClient[0]).toEqual({
      contratacionId: '31',
      servicio: 'Servicio 31',
      estado: 'completado',
      fechaHora: '2026-11-10T14:00:00.000Z',
      contraparte: { id: 'p5', nombre: 'Ana Ríos', fotoUrl: null },
      ultimoMensaje: { texto: 'Listo', fecha: '2026-10-23T10:00:00.000Z', mio: false },
      sinLeer: 3,
      soloLectura: true,
    });
    expect(asClient[1]).toMatchObject({ ultimoMensaje: null, sinLeer: 0, soloLectura: false });
  });

  it('HU-42: con el perfil de prestador, la contraparte es el cliente', async () => {
    prisma.service_requests.findMany.mockResolvedValue([listRow(30n)]);

    const [chat] = await service.mine(user(2n, 'provider'));

    expect(prisma.service_requests.findMany.mock.calls[0][0].where).toEqual({ provider_profiles: { user_id: 2n } });
    expect(chat.contraparte).toEqual({ id: 'c9', nombre: 'Luis Gómez', fotoUrl: 'https://cdn/public/luis.jpg' });
  });
});
