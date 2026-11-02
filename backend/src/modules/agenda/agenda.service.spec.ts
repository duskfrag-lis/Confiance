import { AgendaService } from './agenda.service';

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

describe('E6 AgendaService', () => {
  let prisma: any;
  let service: AgendaService;

  const appointment = (at: string, status = 'upcoming') => ({
    appointment_id: 7n,
    scheduled_datetime: new Date(at),
    appointment_statuses: { status_name: status },
    service_requests: {
      service_request_id: 30n,
      request_statuses: { status_name: 'confirmado' },
      service_listings: { title: 'Instalación de lámparas' },
      needs: null,
      neighborhoods: { neighborhood_name: 'Laureles', communes: { commune_name: 'Laureles-Estadio' } },
      users: { first_name: 'Laura', last_name: 'Gómez', profile_photo_url: null },
      provider_profiles: { provider_profile_id: 4n, users: { first_name: 'Ana', last_name: 'Ruiz', profile_photo_url: null } },
    },
  });

  beforeEach(() => {
    prisma = {
      appointments: { findMany: jest.fn().mockResolvedValue([appointment('2026-10-26T14:00:00Z')]) },
      time_blocks: {
        findMany: jest.fn().mockResolvedValue([
          { block_name: 'morning', start_time: time('06:00'), end_time: time('12:00') },
          { block_name: 'afternoon', start_time: time('12:00'), end_time: time('18:00') },
          { block_name: 'evening', start_time: time('18:00'), end_time: time('22:00') },
        ]),
      },
    };
    service = new AgendaService(prisma, { publicUrl: () => null } as any);
  });

  it('HU-41: las del cliente, ordenadas por fecha, con su contratación y el prestador', async () => {
    const [cita] = await service.list({ userId: 9n, activeProfile: 'client' } as any);

    expect(prisma.appointments.findMany.mock.calls[0][0]).toMatchObject({
      where: { service_requests: { client_id: 9n } },
      orderBy: [{ scheduled_datetime: 'asc' }, { appointment_id: 'asc' }],
    });
    expect(cita).toEqual({
      id: '7', contratacionId: '30', servicio: 'Instalación de lámparas', fechaHora: '2026-10-26T14:00:00.000Z',
      bloque: 'manana', estado: 'proxima', estadoContratacion: 'confirmado',
      zona: { barrio: 'Laureles', comuna: 'Laureles-Estadio' },
      prestador: { id: '4', nombre: 'Ana Ruiz', fotoUrl: null },
    });
  });

  it('HU-41: las del prestador muestran al cliente; filtro por estado', async () => {
    prisma.appointments.findMany.mockResolvedValue([appointment('2026-10-27T00:30:00Z', 'cancelled')]);

    const [cita] = await service.list({ userId: 2n, activeProfile: 'provider' } as any, 'cancelada');

    expect(prisma.appointments.findMany.mock.calls[0][0].where).toEqual({
      service_requests: { provider_profiles: { user_id: 2n } },
      appointment_statuses: { status_name: 'cancelled' },
    });
    // 19:30 en Bogotá
    expect(cita).toMatchObject({ estado: 'cancelada', bloque: 'noche', cliente: { nombre: 'Laura Gómez' } });
    expect(cita).not.toHaveProperty('prestador');
  });
});
