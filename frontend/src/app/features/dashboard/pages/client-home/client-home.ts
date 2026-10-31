import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatTime } from '../../../../shared/utils/format';
import { Appointment } from '../../../agenda/models/appointment.models';
import { AgendaService } from '../../../agenda/services/agenda.service';
import { ClientContract } from '../../../contracting/models/contract';
import { ContractsService } from '../../../contracting/services/contracts.service';
import { NEED_STATE_LABEL, Need } from '../../../publications/models/need.models';
import { NeedsService } from '../../../publications/services/needs.service';
import { ListingCard } from '../../../search/models/search.models';
import { SearchService } from '../../../search/services/search.service';
import { NextAppointmentCard } from '../../components/next-appointment/next-appointment';
import { PendingList } from '../../components/pending-list/pending-list';
import { PendingItem } from '../../models/home.models';
import { greeting, toNextAppointment, upcoming, withinDays } from '../../utils/home';

interface Data {
  contracts: ClientContract[] | null;
  needs: Need[] | null;
  appointments: Appointment[] | null;
  listings: ListingCard[] | null;
}

const SHOWN = 3;
const weekday = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' });

const safe = <T>(source: Observable<T>) => source.pipe(catchError(() => of(null)));

@Component({
  selector: 'app-client-home',
  imports: [RouterLink, Icon, PendingList, NextAppointmentCard],
  templateUrl: './client-home.html',
  styleUrls: ['../../_home.scss', './client-home.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientHome {
  protected readonly session = inject(CurrentUserService);

  protected readonly hello = greeting();
  protected readonly cop = formatCop;
  protected readonly needLabel = NEED_STATE_LABEL;
  protected readonly data = signal<Data | null>(null);

  protected readonly pending = computed<PendingItem[]>(() => {
    const d = this.data();
    if (!d) return [];
    const items: PendingItem[] = [];
    for (const c of d.contracts ?? []) {
      const link = ['/cliente/contrataciones', c.id];
      const detail = `${c.service} · ${c.provider.name}`;
      if (c.status === 'aceptado') items.push({ id: `c${c.id}`, icon: 'circle-check', tone: 'accent', title: 'Confirma la contratación', detail, cta: 'Confirmar', link });
      if (c.status === 'finalizado') items.push({ id: `c${c.id}`, icon: 'money', tone: 'warning', title: 'Confirma la finalización y paga', detail, cta: 'Revisar', link });
    }
    for (const n of d.needs ?? []) {
      if (n.estado === 'abierta' && n.interesados) {
        items.push({
          id: `n${n.id}`,
          icon: 'sparkle',
          tone: 'primary',
          title: `${n.interesados} ${n.interesados === 1 ? 'prestador interesado' : 'prestadores interesados'}`,
          detail: n.titulo,
          cta: 'Ver',
          link: ['/cliente/necesidades', n.id],
        });
      }
    }
    return items;
  });

  private readonly upcomingList = computed(() => upcoming(this.data()?.appointments ?? []));
  protected readonly next = computed(() => {
    const a = this.upcomingList()[0];
    return a ? toNextAppointment(a, '/cliente') : null;
  });
  protected readonly moreThisWeek = computed(() => this.upcomingList().slice(1).filter((a) => withinDays(a.fechaHora, 7)).length);

  protected readonly needs = computed(() =>
    [...(this.data()?.needs ?? [])].sort((a, b) => Number(a.estado === 'cerrada') - Number(b.estado === 'cerrada') || b.publicada.localeCompare(a.publicada)).slice(0, SHOWN),
  );

  protected readonly listings = computed(() => (this.data()?.listings ?? []).slice(0, SHOWN));

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
    const needs = inject(NeedsService);
    const agenda = inject(AgendaService);
    const search = inject(SearchService);
    forkJoin({
      contracts: safe(contracts.clientList()),
      needs: safe(needs.listMine()),
      appointments: safe(agenda.mine()),
      listings: safe(search.search({}).pipe(map((p) => p.resultados))),
    }).subscribe((d) => this.data.set(d));
  }

  protected rating(l: ListingCard): string {
    const r = l.prestador.calificacion;
    return r.cantidad ? `★ ${r.promedio.toFixed(1)} (${r.cantidad})` : 'Sin reseñas aún';
  }
}
