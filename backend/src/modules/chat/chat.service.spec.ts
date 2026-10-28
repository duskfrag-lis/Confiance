import { HttpException } from '@nestjs/common';
import { ChatService } from './chat.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

describe('E7 ChatService', () => {
  let prisma: any;
  let notifications: any;
  let service: ChatService;

  // Cliente 9n, prestador 2n
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

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()) },
      chat_messages: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(message(51n)) },
      notifications: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new ChatService(prisma, notifications);
  });

  it('HU-42: quien no es parte no ve el chat (404, sin revelar que existe)', async () => {
    expect(await codeOf(service.history(77n, 30n, {}))).toBe(404);
    expect(await codeOf(service.send(77n, 30n, 'hola'))).toBe(404);
  });

  it('HU-42: historial de lo más viejo a lo más nuevo, con cursor hacia atrás', async () => {
    prisma.chat_messages.findMany.mockResolvedValue([message(53n), message(52n, 2n), message(51n)]);

    const page = await service.history(9n, 30n, { limite: 2 });

    expect(prisma.chat_messages.findMany.mock.calls[0][0]).toMatchObject({
      where: { service_request_id: 30n },
      orderBy: { message_id: 'desc' },
      take: 3,
    });
    expect(page.mensajes.map((m) => [m.id, m.autor])).toEqual([['52', 'prestador'], ['53', 'cliente']]);
    expect(page).toMatchObject({ estado: 'aceptado', soloLectura: false, siguienteCursor: '52' });
  });

  it('HU-42: con antesDe pide los anteriores; sin más páginas el cursor es null', async () => {
    const page = await service.history(2n, 30n, { antesDe: '52' });

    expect(prisma.chat_messages.findMany.mock.calls[0][0].where).toEqual({ service_request_id: 30n, message_id: { lt: 52n } });
    expect(page.siguienteCursor).toBeNull();
  });

  it('HU-42: envía, guarda y avisa a la otra parte', async () => {
    const sent = await service.send(9n, 30n, 'hola');

    expect(prisma.chat_messages.create.mock.calls[0][0].data).toEqual({ service_request_id: 30n, sender_id: 9n, message_text: 'hola' });
    expect(notifications.notify).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: 2n, type: 'new_chat_message', serviceRequestId: 30n })],
      prisma,
    );
    expect(sent).toEqual({ id: '51', contratacionId: '30', autor: 'cliente', texto: 'hola 51', enviadoEn: '2026-10-22T15:00:00.000Z' });
  });

  it('HU-62: no repite el aviso si la otra parte ya tiene uno sin leer de este chat', async () => {
    prisma.notifications.findFirst.mockResolvedValue({ notification_id: 1n });

    await service.send(2n, 30n, 'otra vez');

    expect(prisma.notifications.findFirst.mock.calls[0][0].where).toMatchObject({ user_id: 9n, is_read: false });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it.each(['rechazado', 'cancelado', 'completado'])('D-53: en %s el chat es de solo lectura', async (state) => {
    prisma.service_requests.findUnique.mockResolvedValue(request(state));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('CHAT_READ_ONLY');
    expect(prisma.chat_messages.create).not.toHaveBeenCalled();
    expect((await service.history(9n, 30n, {})).soloLectura).toBe(true);
  });

  it('D-53: si el estado cambia justo antes de guardar, la base lo frena y sale el mismo error', async () => {
    prisma.chat_messages.create.mockRejectedValue(new Error('El chat de una contratación CANCELADO es de solo lectura (service_request_id = 30)'));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('CHAT_READ_ONLY');
  });

  it('D-53: en FINALIZADO todavía se puede escribir', async () => {
    prisma.service_requests.findUnique.mockResolvedValue(request('finalizado'));

    expect(await codeOf(service.send(9n, 30n, 'hola'))).toBe('sin error');
  });
});
