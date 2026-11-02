import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { APPOINTMENT_STATE_LABEL, Appointment, AppointmentState, BLOCK_LABEL } from '../../models/appointment.models';
import { DAY_MS, counterpartOf, dateOfKey, dayTitle, groupByDay, keyOf, monthOf, timeOf, todayKey } from '../../utils/agenda-dates';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const monthName = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const pad = (n: number) => String(n).padStart(2, '0');

/** Vista de mes de la agenda (HU-41): las citas de cada día y, al lado, las del día elegido. */
@Component({
  selector: 'app-agenda-calendar',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './agenda-calendar.html',
  styleUrls: ['../../_tones.scss', './agenda-calendar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaCalendar {
  readonly appointments = input.required<Appointment[]>();
  /** Día en el que se abre el calendario (AAAA-MM-DD). */
  readonly focusDay = input<string | null>(null);
  /** Inicio del panel del perfil activo, para enlazar a la contratación. */
  readonly home = input.required<string>();

  protected readonly stateLabel = APPOINTMENT_STATE_LABEL;
  protected readonly blockLabel = BLOCK_LABEL;
  protected readonly weekdays = WEEKDAYS;
  protected readonly states: AppointmentState[] = ['proxima', 'en_curso', 'completada', 'cancelada'];
  protected readonly time = timeOf;
  protected readonly dayTitle = dayTitle;
  protected readonly counterpart = counterpartOf;

  protected readonly month = signal(monthOf(todayKey()));
  protected readonly selectedDay = signal(todayKey());

  private readonly byDay = computed(() => groupByDay(this.appointments()));
  protected readonly selectedItems = computed(() => this.byDay().get(this.selectedDay()) ?? []);

  protected readonly monthLabel = computed(() => {
    const { year, month } = this.month();
    return monthName.format(dateOfKey(`${year}-${pad(month)}-01`));
  });

  // Semanas del mes, de lunes a domingo, con los días de relleno de los meses vecinos
  protected readonly weeks = computed(() => {
    const { year, month } = this.month();
    const first = dateOfKey(`${year}-${pad(month)}-01`);
    const offset = (first.getUTCDay() + 6) % 7;
    const start = first.getTime() - offset * DAY_MS;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const total = Math.ceil((offset + days) / 7) * 7;
    const today = todayKey();
    const cells = Array.from({ length: total }, (_, i) => {
      const d = new Date(start + i * DAY_MS);
      const key = keyOf({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
      return { key, day: d.getUTCDate(), inMonth: d.getUTCMonth() + 1 === month, isToday: key === today, items: this.byDay().get(key) ?? [] };
    });
    return Array.from({ length: total / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  });

  constructor() {
    effect(() => {
      const day = this.focusDay();
      if (day) untracked(() => this.select(day));
    });
  }

  protected shiftMonth(delta: number): void {
    this.month.update(({ year, month }) => {
      const m = month - 1 + delta;
      return { year: year + Math.floor(m / 12), month: (((m % 12) + 12) % 12) + 1 };
    });
  }

  protected goToday(): void {
    this.select(todayKey());
  }

  protected select(key: string): void {
    this.selectedDay.set(key);
    this.month.set(monthOf(key));
  }

  protected contractLink(a: Appointment): string[] {
    return [`${this.home()}/contrataciones`, a.contratacionId];
  }
}
