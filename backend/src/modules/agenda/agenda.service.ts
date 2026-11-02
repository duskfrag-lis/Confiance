import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { blockKeyOf } from '../profiles/profiles.constants';
import { APPOINTMENT_STATES, appointmentStateKeyOf, type AppointmentStateKey } from './agenda.constants';

const PERSON = { first_name: true, last_name: true, profile_photo_url: true } satisfies Prisma.usersSelect;

const SELECT = {
  appointment_id: true,
  scheduled_datetime: true,
  appointment_statuses: { select: { status_name: true } },
  service_requests: {
    select: {
      service_request_id: true,
      request_statuses: { select: { status_name: true } },
      service_listings: { select: { title: true } },
      needs: { select: { title: true } },
      neighborhoods: { select: { neighborhood_name: true, communes: { select: { commune_name: true } } } },
      users: { select: PERSON },
      provider_profiles: { select: { provider_profile_id: true, users: { select: PERSON } } },
    },
  },
} satisfies Prisma.appointmentsSelect;

/** Hora local de Colombia, HH:MM (los bloques de time_blocks están en hora de Bogotá). */
const bogotaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const hhmm = (time: Date) => time.toISOString().slice(11, 16);

/**
 * HU-41 · Consulta de citas del cliente o del prestador. La cita la crea y la actualiza la base al confirmar y en
 * cada cambio de estado de la contratación (HU-40, trigger fn_service_request_after_write); aquí solo se consulta.
 */
@Injectable()
export class AgendaService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /**
   * Las citas del perfil activo ordenadas por fecha, de la más próxima a la más lejana (HU-41.1), con filtro
   * opcional por estado (HU-41.2). Cada una lleva el id de su contratación (HU-41.3).
   */
  async list(user: AuthUser, state?: AppointmentStateKey) {

    const asClient = user.activeProfile === 'client';

    const [rows, blocks] = await Promise.all([
      this.prisma.appointments.findMany({
        where: {
          service_requests: asClient ? { client_id: user.userId } : { provider_profiles: { user_id: user.userId } },
          ...(state && { appointment_statuses: { status_name: APPOINTMENT_STATES[state] } }),
        },
        orderBy: [{ scheduled_datetime: 'asc' }, { appointment_id: 'asc' }],
        select: SELECT,
      }),
      this.prisma.time_blocks.findMany({ select: { block_name: true, start_time: true, end_time: true } }),
    ]);

    const blockOf = (at: Date) => {

      const local = bogotaTime.format(at);
      const block = blocks.find((b) => local >= hhmm(b.start_time) && local < hhmm(b.end_time));
      return block ? blockKeyOf(block.block_name) : null;
    };

    return rows.map((a) => {

      const r = a.service_requests;
      const person = (u: { first_name: string; last_name: string; profile_photo_url: string | null }) => ({
        nombre: `${u.first_name} ${u.last_name}`,
        fotoUrl: this.storage.publicUrl(u.profile_photo_url),
      });

      return {
        id: String(a.appointment_id),
        contratacionId: String(r.service_request_id),
        servicio: r.service_listings?.title ?? r.needs?.title ?? 'Servicio',
        fechaHora: a.scheduled_datetime.toISOString(),
        bloque: blockOf(a.scheduled_datetime),
        estado: appointmentStateKeyOf(a.appointment_statuses.status_name),
        estadoContratacion: r.request_statuses.status_name,
        zona: { barrio: r.neighborhoods.neighborhood_name, comuna: r.neighborhoods.communes.commune_name },
        ...(asClient
          ? { prestador: { id: String(r.provider_profiles.provider_profile_id), ...person(r.provider_profiles.users) } }
          : { cliente: person(r.users) }),
      };
    });
  }
}
