import { HttpException, NotFoundException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService, PAGE_SIZE } from './chat.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const request = (state = 'confirmado') => ({
  client_id: 9n,
  request_statuses: { status_name: state },
  provider_profiles: { user_id: 2n },
  service_listings: { title: 'Instalación de lámparas' },
  needs: null,
});

const row = (id: number, sender = 9n) => ({
  message_id: BigInt(id), sender_id: sender, message_text: `m${id}`, sent_at: new Date(`2026-10-20T15:00:${String(id % 60).padStart(2, '0')}Z`),
});

describe('E7 ChatService', () => {
  let prisma: any;
  let notifications: any;
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(request()) },
      chat_messages: {
        findMany: jest.fn().mockResolvedValue([row(3), row(2, 2n), row(1)]),
        create: jest.fn(({ data }) => Promise.resolve({
          message_id: 4n, sender_id: data.sender_id, message_text: data.message_text,
          sent_at: new Date('2026-10-20T16:00:00Z'), users: { first_name: 'Laura' },
        })),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    notifications = { notify: jest.fn() };
    service = new ChatService(prisma, notifications);
  });

  it('HU-42.1: solo las dos partes; a cualquier otro, 404', async () => {
    await expect(service.history(7n, 30n)).rejects.toBeInstanceOf(NotFoundException);
    await expect(codeOf(service.send(7n, 30n, 'hola'))).resolves.toBe(404);
    prisma.service_requests.findUnique.mockResolvedValue(null);
    await expect(service.history(9n, 30n)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('HU-42.4: historial del más antiguo al más reciente, con autor y fecha', async () => {
    const page = await service.history(2n, 30n);

    expect(prisma.chat_messages.findMany.mock.calls[0][0]).toEqual({
      where: { service_request_id: 30n }, orderBy: { message_id: 'desc' }, take: PAGE_SIZE + 1,
    });
    expect(page.soloLectura).toBe(false);
    expect(page.hayMas).toBe(false);
    expect(page.mensajes.map((m) => [m.id, m.autor])).toEqual([['1', 'cliente'], ['2', 'prestador'], ['3', 'cliente']]);
    expect(page.mensajes[0]).toMatchObject({ contratacionId: '30', texto: 'm1', fecha: '2026-10-20T15:00:01.000Z' });
  });

  it('pagina hacia atrás con `antes` y avisa si hay más', async () => {
    prisma.chat_messages.findMany.mockResolvedValue(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => row(200 - i)));

    const page = await service.history(9n, 30n, 201n);

    expect(prisma.chat_messages.findMany.mock.calls[0][0].where).toEqual({ service_request_id: 30n, message_id: { lt: 201n } });
    expect(page.hayMas).toBe(true);
    expect(page.mensajes).toHaveLength(PAGE_SIZE);
    expect(page.mensajes[0].id).toBe(String(200 - PAGE_SIZE + 1));
  });

  it('HU-42.5: guarda el mensaje y avisa a la otra parte en la misma transacción', async () => {
    const message = await service.send(9n, 30n, 'Llego a las 9');

    expect(prisma.chat_messages.create.mock.calls[0][0].data).toEqual({ service_request_id: 30n, sender_id: 9n, message_text: 'Llego a las 9' });
    expect(notifications.notify).toHaveBeenCalledWith([expect.objectContaining({
      userId: 2n, type: 'new_chat_message', serviceRequestId: 30n,
      message: 'Laura te escribió sobre "Instalación de lámparas": Llego a las 9',
    })], prisma);
    expect(message).toEqual({
      id: '4', contratacionId: '30', autor: 'cliente', autorId: '9', texto: 'Llego a las 9', fecha: '2026-10-20T16:00:00.000Z',
    });
  });

  it('el aviso recorta los mensajes largos', async () => {
    await service.send(2n, 30n, 'x'.repeat(500));

    const [[notice]] = notifications.notify.mock.calls[0];
    expect(notice.userId).toBe(9n);
    expect(notice.message.endsWith('…')).toBe(true);
    expect(notice.message.length).toBeLessThan(300);
  });

  it('HU-42.2: en RECHAZADO, CANCELADO y COMPLETADO se lee pero no se escribe', async () => {
    for (const state of ['rechazado', 'cancelado', 'completado']) {
      prisma.service_requests.findUnique.mockResolvedValue(request(state));
      await expect(codeOf(service.send(9n, 30n, 'hola'))).resolves.toBe('CHAT_READ_ONLY');
      await expect(service.history(9n, 30n)).resolves.toMatchObject({ soloLectura: true });
    }
    expect(prisma.chat_messages.create).not.toHaveBeenCalled();
  });

  it('si se cierra justo antes de guardar, la regla de la base sale como CHAT_READ_ONLY', async () => {
    prisma.chat_messages.create.mockRejectedValue(new Error('El chat de una contratación CANCELADO es de solo lectura (service_request_id = 30)'));
    await expect(codeOf(service.send(9n, 30n, 'hola'))).resolves.toBe('CHAT_READ_ONLY');
  });
});

describe('E7 ChatGateway', () => {
  let chat: any;
  let jwt: any;
  let strategy: any;
  let gateway: ChatGateway;
  let emitToRoom: jest.Mock;

  const socket = (cookie?: string) => ({
    id: 's1',
    handshake: { headers: { cookie } },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
  }) as any;

  beforeEach(() => {
    chat = {
      partyOf: jest.fn().mockResolvedValue({ readOnly: false }),
      send: jest.fn().mockResolvedValue({ id: '4', contratacionId: '30', texto: 'hola' }),
    };
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: '9', sid: '1', profile: 'client', adm: false }) };
    strategy = { validate: jest.fn().mockResolvedValue({ userId: 9n, sessionId: 1n, activeProfile: 'client', isAdmin: false }) };
    gateway = new ChatGateway(chat, jwt, { get: () => 'secreto' } as any, strategy);
    emitToRoom = jest.fn();
    (gateway as any).server = { to: jest.fn(() => ({ emit: emitToRoom })) };
  });

  it('sin cookie de sesión, o con una sesión cerrada, desconecta y avisa', async () => {
    const anonymous = socket();
    await gateway.handleConnection(anonymous);
    expect(anonymous.emit).toHaveBeenCalledWith('sesion_expirada');
    expect(anonymous.disconnect).toHaveBeenCalledWith(true);

    strategy.validate.mockRejectedValue(new Error('Unauthorized'));
    const revoked = socket('access_token=abc');
    await expect(gateway.send(revoked, { contratacionId: '30', texto: 'hola' })).resolves.toMatchObject({ ok: false, code: 'SESSION_EXPIRED' });
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('valida la cookie con el secreto de acceso y las reglas de JwtStrategy', async () => {
    const s = socket('otra=1; access_token=abc%2Edef');
    await gateway.handleConnection(s);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('abc.def', { secret: 'secreto' });
    expect(strategy.validate).toHaveBeenCalled();
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('unirse: solo a la sala de una contratación propia', async () => {
    const s = socket('access_token=abc');
    await expect(gateway.join(s, { contratacionId: '30' })).resolves.toEqual({ ok: true, soloLectura: false });
    expect(s.join).toHaveBeenCalledWith('contratacion:30');

    chat.partyOf.mockRejectedValue(new NotFoundException('La contratación no existe.'));
    await expect(gateway.join(s, { contratacionId: '31' })).resolves.toMatchObject({ ok: false, code: '404' });
    await expect(gateway.join(s, { contratacionId: 'x' })).resolves.toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('enviar: guarda y emite a la sala; valida el texto', async () => {
    const s = socket('access_token=abc');

    await expect(gateway.send(s, { contratacionId: '30', texto: '  hola  ' })).resolves.toMatchObject({ ok: true });
    expect(chat.send).toHaveBeenCalledWith(9n, 30n, 'hola');
    expect((gateway as any).server.to).toHaveBeenCalledWith('contratacion:30');
    expect(emitToRoom).toHaveBeenCalledWith('mensaje', expect.objectContaining({ id: '4' }));

    await expect(gateway.send(s, { contratacionId: '30', texto: '   ' })).resolves.toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    await expect(gateway.send(s, { contratacionId: '30', texto: 'x'.repeat(2001) })).resolves.toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('frena a quien envía más de 10 mensajes en 10 segundos', async () => {
    const s = socket('access_token=abc');

    for (let i = 0; i < 10; i++) await gateway.send(s, { contratacionId: '30', texto: `m${i}` });

    await expect(gateway.send(s, { contratacionId: '30', texto: 'uno más' })).resolves.toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(chat.send).toHaveBeenCalledTimes(10);
  });
});
