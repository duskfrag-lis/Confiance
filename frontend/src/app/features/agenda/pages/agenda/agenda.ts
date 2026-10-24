import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { AgendaCalendar } from '../../components/agenda-calendar/agenda-calendar';
import { AgendaList } from '../../components/agenda-list/agenda-list';
import { Appointment, AppointmentState, BLOCK_LABEL } from '../../models/appointment.models';
import { AgendaService } from '../../services/agenda.service';
import { DAY_MS, counterpartOf, dateOfKey, dayKeyOf, daysFromToday, timeOf } from '../../utils/agenda-dates';

type View = 'calendar' | 'list';
type Filter = 'all' | AppointmentState;

const VIEW_KEY = 'confiance.agenda.view';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'proxima', label: 'Próximas' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'completada', label: 'Completadas' },
  { id: 'cancelada', label: 'Canceladas' },
];

const shortMonth = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const shortWeekday = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' });

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'calendar';
  } catch {
    return 'calendar';
  }
}

@Component({
  selector: 'app-agenda',
  imports: [RouterLink, Avatar, Icon, AgendaCalendar, AgendaList],
  templateUrl: './agenda.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../../_tones.scss', './agenda.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaPage {
  private readonly agenda = inject(AgendaService);
  protected readonly session = inject(CurrentUserService);

  protected readonly blockLabel = BLOCK_LABEL;
  protected readonly time = timeOf;
  protected readonly counterpart = counterpartOf;

  protected readonly items = signal<Appointment[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly view = signal<View>(readView());
  protected readonly filter = signal<Filter>('all');

  protected readonly isProvider = computed(() => this.session.current()?.perfilActivo === 'provider');

  protected readonly filters = computed(() => {
    const list = this.items() ?? [];
    return FILTERS.map((f) => ({ ...f, count: f.id === 'all' ? list.length : list.filter((a) => a.estado === f.id).length }));
  });

  protected readonly visible = computed(() => {
    const list = this.items() ?? [];
    const f = this.filter();
    return f === 'all' ? list : list.filter((a) => a.estado === f);
  });

  protected readonly next = computed(() => {
    const list = this.items() ?? [];
    const now = Date.now();
    return (
      list.find((a) => a.estado === 'en_curso') ??
      list.find((a) => a.estado === 'proxima' && new Date(a.fechaHora).getTime() >= now - DAY_MS) ??
      null
    );
  });

  protected readonly focusDay = computed(() => {
    const n = this.next();
    return n ? dayKeyOf(n.fechaHora) : null;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.agenda.mine().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected setView(view: View): void {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
    
    }
  }

  protected dayNumber(iso: string): string {
    return dayKeyOf(iso).slice(8).replace(/^0/, '');
  }

  protected dayMonth(iso: string): string {
    return shortMonth.format(dateOfKey(dayKeyOf(iso))).replace('.', '');
  }

  protected dayWeekday(iso: string): string {
    return shortWeekday.format(dateOfKey(dayKeyOf(iso))).replace('.', '');
  }

  protected countdown(a: Appointment): string {
    const diff = daysFromToday(dayKeyOf(a.fechaHora));
    if (diff <= 0) return 'hoy';
    if (diff === 1) return 'mañana';
    return `en ${diff} días`;
  }

  protected contractLink(a: Appointment): string[] {
    return [`${this.session.home()}/contrataciones`, a.contratacionId];
  }
}
