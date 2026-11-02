import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatTime } from '../../../../shared/utils/format';
import { Appointment } from '../../../agenda/models/appointment.models';
import { AgendaService } from '../../../agenda/services/agenda.service';
import { PaymentRecord } from '../../../contracting/models/contract-api.models';
import { Contract } from '../../../contracting/models/contract';
import { ContractsService } from '../../../contracting/services/contracts.service';
import { ProviderProfile, ProviderSection } from '../../../profiles/models/profiles.models';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { Listing } from '../../../publications/models/listing.models';
import { BoardNeed } from '../../../publications/models/need.models';
import { ListingsService } from '../../../publications/services/listings.service';
import { NeedsService } from '../../../publications/services/needs.service';
import { NextAppointmentCard } from '../../components/next-appointment/next-appointment';
import { PendingList } from '../../components/pending-list/pending-list';
import { PendingItem } from '../../models/home.models';
import { greeting, isTodayOrPast, toNextAppointment, upcoming, withinDays } from '../../utils/home';

interface Data {
  contracts: Contract[] | null;
  appointments: Appointment[] | null;
  needs: BoardNeed[] | null;
  profile: ProviderProfile | null;
  listings: Listing[] | null;
  payments: PaymentRecord[] | null;
}

const SECTIONS: { id: ProviderSection; label: string; link: string }[] = [
  { id: 'foto', label: 'Foto de perfil', link: '/prestador/perfil' },
  { id: 'descripcion', label: 'Descripción', link: '/prestador/perfil' },
  { id: 'oficios', label: 'Oficios', link: '/prestador/perfil' },
  { id: 'zonas', label: 'Zonas de atención', link: '/prestador/perfil' },
  { id: 'disponibilidad', label: 'Disponibilidad', link: '/prestador/perfil' },
  { id: 'evidencias', label: 'Trabajos realizados', link: '/prestador/trabajos' },
];

const VERIFICATION_LABEL = {
  pendiente: 'Verificación en revisión',
  rechazada: 'Verificación rechazada',
  correccion: 'Verificación con corrección pedida',
};

const SHOWN = 3;
const weekday = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' });

const safe = <T>(source: Observable<T>) => source.pipe(catchError(() => of(null)));

@Component({
  selector: 'app-provider-home',
  imports: [RouterLink, Icon, PendingList, NextAppointmentCard],
  templateUrl: './provider-home.html',
  styleUrls: ['../../_home.scss', './provider-home.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderHome {
  protected readonly session = inject(CurrentUserService);

  protected readonly hello = greeting();
  protected readonly cop = formatCop;
  protected readonly data = signal<Data | null>(null);

  protected readonly pending = computed<PendingItem[]>(() => {
    const d = this.data();
    if (!d) return [];
    const items: PendingItem[] = [];
    for (const c of d.contracts ?? []) {
      const link = ['/prestador/contrataciones', c.id];
      const detail = `${c.service} · ${c.client.name}`;
      if (c.status === 'solicitado') items.push({ id: `c${c.id}`, icon: 'clock', tone: 'accent', title: 'Responde la solicitud', detail, cta: 'Responder', link, at: c.createdAt });
      if (c.status === 'confirmado' && isTodayOrPast(c.scheduledAt)) items.push({ id: `c${c.id}`, icon: 'play', tone: 'primary', title: 'Inicia el servicio', detail, cta: 'Iniciar', link, at: c.scheduledAt });
      if (c.status === 'en_curso') items.push({ id: `c${c.id}`, icon: 'check', tone: 'success', title: 'Marca el servicio como finalizado', detail, cta: 'Finalizar', link, at: c.scheduledAt });
    }
    for (const p of d.payments ?? []) {
      if (p.estado === 'pendiente_confirmacion') {
        items.push({
          id: `p${p.contratacionId}`,
          icon: 'money',
          tone: 'warning',
          title: 'Confirma si te llegó la transferencia',
          detail: `${p.servicio} · ${formatCop(p.monto)}`,
          cta: 'Confirmar',
          link: ['/prestador/contrataciones', p.contratacionId],
          at: new Date(p.fecha ?? p.finalizada),
        });
      }
    }
    return items;
  });

  private readonly upcomingList = computed(() => upcoming(this.data()?.appointments ?? []));
  protected readonly next = computed(() => {
    const a = this.upcomingList()[0];
    return a ? toNextAppointment(a, '/prestador') : null;
  });
  protected readonly moreThisWeek = computed(() => this.upcomingList().slice(1).filter((a) => withinDays(a.fechaHora, 7)).length);

  protected readonly profileTodo = computed(() => {
    const p = this.data()?.profile;
    if (!p) return null;
    const missing = SECTIONS.filter((s) => p.faltantes.includes(s.id));
    const verified = p.verificacion === 'aprobada';
    const total = SECTIONS.length + 1;
    const done = total - missing.length - (verified ? 0 : 1);
    if (!missing.length && verified) return null;
    return {
      missing,
      verified,
      verificationLabel: p.verificacion && p.verificacion !== 'aprobada' ? VERIFICATION_LABEL[p.verificacion] : 'Verificar mi identidad',
      progress: Math.round((done / total) * 100),
    };
  });

  protected readonly needs = computed(() =>
    [...(this.data()?.needs ?? [])].sort((a, b) => Number(!!b.deTuOficio) - Number(!!a.deTuOficio)).slice(0, SHOWN),
  );

  protected readonly business = computed(() => {
    const d = this.data();
    const pays = d?.payments ?? [];
    const sum = (states: string[]) => pays.filter((p) => states.includes(p.estado)).reduce((t, p) => t + p.monto, 0);
    const listings = d?.listings ?? [];
    return {
      received: sum(['pagado']),
      toCollect: sum(['pendiente', 'en_proceso', 'pendiente_confirmacion']),
      activeListings: listings.filter((l) => l.estado === 'activo').length,
      totalListings: listings.length,
      rating: d?.profile?.calificacion ?? null,
      completed: d?.profile?.serviciosCompletados ?? 0,
    };
  });

  protected readonly summary = computed(() => {
    const n = this.pending().length;
    const next = this.next();
    const parts = [n ? `Tienes ${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Estás al día'];
    if (next && !next.inProgress) parts.push(`tu próxima cita es el ${weekday.format(next.date)} a las ${formatTime(next.date)}`);
    if (next?.inProgress) parts.push('tienes un servicio en curso');
    const text = parts.join(' y ');
    return text.endsWith('.') ? text : `${text}.`;
  });

  constructor() {
    const contracts = inject(ContractsService);
    const agenda = inject(AgendaService);
    const needs = inject(NeedsService);
    const profiles = inject(ProfilesService);
    const listings = inject(ListingsService);
    forkJoin({
      contracts: safe(contracts.providerList()),
      appointments: safe(agenda.mine()),
      needs: safe(needs.board({ pagina: 1 }).pipe(map((p) => p.resultados))),
      profile: safe(profiles.getProvider()),
      listings: safe(listings.listMine()),
      payments: safe(contracts.payments()),
    }).subscribe((d) => this.data.set(d));
  }
}
