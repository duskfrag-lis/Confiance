import { NotFoundException } from '@nestjs/common';
import { ContractsQueryService, contractActions, type ActionContext } from './contracts-query.service';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 20, 12);

const ctx = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  side: 'cliente',
  state: 'solicitado',
  scheduledAt: new Date(NOW + 72 * HOUR),
  pendingRescheduleBy: null,
  reschedules: 0,
  clientConfirmedCompletion: false,
  payment: null,
  ratedByMe: false,
  now: NOW,
  ...overrides,
});

describe('HU-38.6 acciones permitidas', () => {
  it('SOLICITADO: el prestador acepta o rechaza; los dos pueden cancelar', () => {
    expect(contractActions(ctx({ side: 'prestador' }))).toEqual(['aceptar', 'rechazar', 'cancelar', 'cancelar_fuerza_mayor']);
    expect(contractActions(ctx())).toEqual(['cancelar', 'cancelar_fuerza_mayor']);
  });

  it('ACEPTADO: el cliente confirma; con 24 h o menos no se cancela, se reagenda (HU-50.2)', () => {
    expect(contractActions(ctx({ state: 'aceptado' }))).toEqual(['confirmar', 'cancelar', 'cancelar_fuerza_mayor', 'reagendar']);
    expect(contractActions(ctx({ state: 'aceptado', scheduledAt: new Date(NOW + 23 * HOUR) })))
      .toEqual(['confirmar', 'cancelar_fuerza_mayor', 'reagendar']);
  });

  it('CONFIRMADO: el prestador inicia; reagendar respeta la pendiente y el máximo de 2 (HU-53.4)', () => {
    expect(contractActions(ctx({ side: 'prestador', state: 'confirmado' })))
      .toEqual(['iniciar', 'cancelar', 'cancelar_fuerza_mayor', 'reagendar']);
    expect(contractActions(ctx({ state: 'confirmado', reschedules: 2 }))).not.toContain('reagendar');
    // La pidió el prestador: el cliente la responde y no puede pedir otra
    const withPending = contractActions(ctx({ state: 'confirmado', pendingRescheduleBy: 'prestador', reschedules: 1 }));
    expect(withPending).toContain('responder_reagendamiento');
    expect(withPending).not.toContain('reagendar');
    expect(contractActions(ctx({ side: 'prestador', state: 'confirmado', pendingRescheduleBy: 'prestador' })))
      .not.toContain('responder_reagendamiento');
  });

  it('EN_CURSO: solo el prestador finaliza; ya no hay cancelación ordinaria (HU-50.3)', () => {
    expect(contractActions(ctx({ side: 'prestador', state: 'en_curso' }))).toEqual(['finalizar', 'cancelar_fuerza_mayor']);
    expect(contractActions(ctx({ state: 'en_curso' }))).toEqual(['cancelar_fuerza_mayor']);
  });

  it('FINALIZADO: confirmar, pagar y confirmar la transferencia según el pago (HU-43, HU-44, HU-47)', () => {
    expect(contractActions(ctx({ state: 'finalizado', payment: 'pendiente' })))
      .toEqual(['confirmar_finalizacion', 'pagar', 'reportar', 'reclamar']);
    // PSE en curso: no se ofrece pagar otra vez
    expect(contractActions(ctx({ state: 'finalizado', payment: 'en_proceso', clientConfirmedCompletion: true })))
      .toEqual(['reportar', 'reclamar']);
    expect(contractActions(ctx({ side: 'prestador', state: 'finalizado', payment: 'pendiente_confirmacion' })))
      .toEqual(['confirmar_transferencia', 'reportar', 'reclamar']);
  });

  it('COMPLETADO: calificar una sola vez (HU-49.2)', () => {
    expect(contractActions(ctx({ state: 'completado' }))).toEqual(['calificar', 'reportar', 'reclamar']);
    expect(contractActions(ctx({ state: 'completado', ratedByMe: true }))).toEqual(['reportar', 'reclamar']);
  });

  it('CANCELADO y RECHAZADO no tienen acciones', () => {
    expect(contractActions(ctx({ state: 'cancelado' }))).toEqual([]);
    expect(contractActions(ctx({ side: 'prestador', state: 'rechazado' }))).toEqual([]);
  });
});

describe('E5 ContractsQueryService', () => {
  let prisma: any;
  let service: ContractsQueryService;

  const row = (state = 'solicitado', overrides: Record<string, unknown> = {}) => ({
    service_request_id: 30n, client_id: 9n, provider_profile_id: 4n, source_service_listing_id: 12n, source_need_id: null,
    proposed_datetime: new Date(Date.now() + 72 * HOUR), agreed_price: '80000', exact_address: 'Calle 10 # 5-20',
    rejection_reason: null, created_at: new Date('2026-10-20T15:00:00Z'), completion_requested_at: null,
    request_statuses: { status_name: state },
    provider_profiles: { user_id: 2n, users: { first_name: 'Ana', last_name: 'Ruiz', profile_photo_url: null } },
    users: { first_name: 'Laura', last_name: 'Gómez', profile_photo_url: null },
    service_listings: { title: 'Instalación de lámparas' }, needs: null, appointments: null,
    neighborhoods: { neighborhood_id: 3, neighborhood_name: 'Laureles', communes: { commune_id: 11, commune_name: 'Laureles-Estadio' } },
    cancellations: null, appointment_reschedule_requests: [], completion_confirmations: [], issue_reports: [], ratings: [], payments: [],
    ...overrides,
  });

  const payment = (status: string, method = 'pse', at = '2026-10-20T16:00:00Z') => ({
    amount: '80000', created_at: new Date(at), paid_at: status === 'paid' ? new Date(at) : null,
    payment_statuses: { status_name: status }, payment_methods: { method_name: method },
  });

  beforeEach(() => {
    prisma = {
      service_requests: { findUnique: jest.fn().mockResolvedValue(row()), findMany: jest.fn().mockResolvedValue([row()]) },
      audit_events: {
        findMany: jest.fn().mockResolvedValue([
          { actor_id: 9n, previous_state: null, new_state: 'solicitado', occurred_at: new Date('2026-10-20T15:00:00Z') },
        ]),
      },
      provider_bank_accounts: {
        findUnique: jest.fn().mockResolvedValue({ bank_name: 'Bancolombia', account_number: '12345678', bank_account_types: { type_name: 'savings' } }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ block_name: 'morning' }]),
    };
    service = new ContractsQueryService(prisma, { publicUrl: () => null } as any);
  });

  it('HU-38.7: a quien no es parte, 404', async () => {
    await expect(service.detail(7n, 30n)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('HU-38.2: el prestador no ve la dirección antes de ACEPTADO; el cliente siempre', async () => {
    await expect(service.detail(2n, 30n)).resolves.toMatchObject({ rol: 'prestador', direccion: null });
    await expect(service.detail(9n, 30n)).resolves.toMatchObject({ rol: 'cliente', direccion: 'Calle 10 # 5-20' });

    prisma.service_requests.findUnique.mockResolvedValue(row('aceptado'));
    await expect(service.detail(2n, 30n)).resolves.toMatchObject({ direccion: 'Calle 10 # 5-20' });
  });

  it('HU-38.5: el cliente ve los datos bancarios de ACEPTADO a FINALIZADO; el prestador no recibe el campo', async () => {
    const before = await service.detail(9n, 30n);
    expect(before).toHaveProperty('datosBancarios', null);
    expect(prisma.provider_bank_accounts.findUnique).not.toHaveBeenCalled();

    prisma.service_requests.findUnique.mockResolvedValue(row('confirmado'));
    await expect(service.detail(9n, 30n)).resolves.toMatchObject({
      datosBancarios: { banco: 'Bancolombia', tipoCuenta: 'ahorros', numero: '12345678' },
    });
    expect(await service.detail(2n, 30n)).not.toHaveProperty('datosBancarios');
  });

  it('HU-12.4 y HU-38.3: etapas con el actor por rol; plazo de respuesta del prestador', async () => {
    const detail = await service.detail(9n, 30n);

    expect(detail.etapas).toEqual([{ estadoAnterior: null, estado: 'solicitado', fecha: '2026-10-20T15:00:00.000Z', actor: 'cliente' }]);
    expect(detail.plazo).toEqual({ tipo: 'respuesta_prestador', hasta: '2026-10-22T15:00:00.000Z' });
    expect(detail).toMatchObject({ origen: { tipo: 'publicacion', id: '12' }, bloque: 'manana', pago: null, cierre: null });
  });

  it('HU-38.4 y HU-45: pago con su método, los intentos rechazados y el PSE en curso aparte', async () => {
    prisma.service_requests.findUnique.mockResolvedValue(row('finalizado', {
      payments: [payment('rejected'), payment('pending', 'pse', '2026-10-20T17:00:00Z')],
    }));

    const { pago, acciones } = await service.detail(9n, 30n);

    expect(pago).toMatchObject({ estado: 'en_proceso', metodo: 'pse', monto: 80000, fecha: null });
    expect(pago!.intentos.map((i) => i.estado)).toEqual(['rechazado', 'pendiente']);
    expect(acciones).not.toContain('pagar');
  });

  it('HU-12.3: cierre de una cancelada automáticamente y de una rechazada con su motivo', async () => {
    prisma.service_requests.findUnique.mockResolvedValue(row('cancelado', {
      cancellations: {
        cancelled_by: null, reason: 'Plazo vencido', is_automatic: true, is_force_majeure: false,
        created_at: new Date('2026-10-22T15:00:00Z'), force_majeure_statuses: null,
      },
    }));
    await expect(service.detail(9n, 30n)).resolves.toMatchObject({
      cierre: { tipo: 'cancelado', por: 'sistema', automatica: true, fuerzaMayor: null }, acciones: [],
    });

    prisma.service_requests.findUnique.mockResolvedValue(row('rechazado', { rejection_reason: 'Sin repuestos' }));
    await expect(service.detail(9n, 30n)).resolves.toMatchObject({ cierre: { tipo: 'rechazado', motivo: 'Sin repuestos' } });
  });

  it('HU-48 y HU-47.4: el último reporte con quién lo hizo; el del cliente detiene el plazo de 24 h, el del prestador no', async () => {
    const finished = { completion_requested_at: new Date('2026-10-23T15:00:00Z') };
    const report = (by: bigint) => ({ reported_by: by, description: 'Sigue goteando', created_at: new Date('2026-10-23T16:00:00Z') });

    prisma.service_requests.findUnique.mockResolvedValue(row('finalizado', { ...finished, issue_reports: [report(2n)] }));
    const byProvider = await service.detail(9n, 30n);

    expect(byProvider.reporte).toEqual({ por: 'prestador', descripcion: 'Sigue goteando', fecha: '2026-10-23T16:00:00.000Z' });
    expect(byProvider.plazo).toEqual({ tipo: 'confirmacion_finalizacion', hasta: '2026-10-24T15:00:00.000Z' });

    prisma.service_requests.findUnique.mockResolvedValue(row('finalizado', { ...finished, issue_reports: [report(9n)] }));
    const byClient = await service.detail(9n, 30n);

    expect(byClient.reporte).toMatchObject({ por: 'cliente' });
    expect(byClient.plazo).toBeNull();
  });

  it('HU-12.1 y HU-12.2: el listado sale del perfil activo, de la más reciente a la más antigua, con filtro', async () => {
    const asClient = await service.list({ userId: 9n, activeProfile: 'client' } as any, 'aceptado');

    expect(prisma.service_requests.findMany.mock.calls[0][0]).toMatchObject({
      where: { client_id: 9n, request_statuses: { status_name: 'aceptado' } },
      orderBy: [{ created_at: 'desc' }, { service_request_id: 'desc' }],
    });
    expect(asClient[0]).toMatchObject({
      id: '30', servicio: 'Instalación de lámparas', estado: 'solicitado', valor: 80000, prestador: { id: '4', nombre: 'Ana Ruiz' },
    });

    const asProvider = await service.list({ userId: 2n, activeProfile: 'provider' } as any);
    expect(prisma.service_requests.findMany.mock.calls[1][0].where).toEqual({ provider_profiles: { user_id: 2n } });
    expect(asProvider[0]).toMatchObject({ cliente: { nombre: 'Laura Gómez' } });
    expect(asProvider[0]).not.toHaveProperty('prestador');
  });
});
