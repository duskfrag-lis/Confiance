import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { bogotaParts } from '../../utils/format';
import { Icon } from '../icon/icon';

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const sameDay = (a: CalendarDay | null, b: CalendarDay) =>
  !!a && a.year === b.year && a.month === b.month && a.day === b.day;

@Component({
  selector: 'app-mini-calendar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      padding: 0.9rem;
      border: 1px solid var(--c-border);
      border-radius: 14px;
      background: var(--c-white);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.6rem;
      font-weight: 600;
    }
    .nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--c-text);
      cursor: pointer;
      &:hover:not(:disabled) {
        background: var(--c-surface-3);
      }
      &:disabled {
        opacity: 0.3;
        cursor: default;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 0.2rem;
      text-align: center;
    }
    .weekday {
      padding-bottom: 0.25rem;
      color: var(--c-muted);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .day {
      aspect-ratio: 1;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--c-text);
      font-weight: 500;
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-out);

      &:hover:not(:disabled):not(.is-selected) {
        background: var(--c-primary-soft);
      }
      &:disabled {
        color: color-mix(in srgb, var(--c-muted) 45%, transparent);
        cursor: default;
      }
      &.is-today {
        box-shadow: inset 0 0 0 1px var(--c-primary);
      }
      &.is-selected {
        background: var(--c-primary);
        color: var(--c-white);
      }
      &:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 1px;
      }
    }
  `,
  template: `
    <div class="head">
      <button type="button" class="nav" (click)="move(-1)" [disabled]="!canGoBack()" aria-label="Mes anterior">
        <app-icon name="caret-left" [size]="18" />
      </button>
      <span aria-live="polite">{{ title() }}</span>
      <button type="button" class="nav" (click)="move(1)" [disabled]="!canGoForward()" aria-label="Mes siguiente">
        <app-icon name="caret-right" [size]="18" />
      </button>
    </div>

    <div class="grid" role="grid">
      @for (w of weekdays; track $index) {
        <span class="weekday" aria-hidden="true">{{ w }}</span>
      }
      @for (cell of cells(); track $index) {
        @if (cell) {
          <button
            type="button"
            class="day"
            [class.is-today]="cell.today"
            [class.is-selected]="cell.selected"
            [disabled]="!cell.enabled"
            [attr.aria-pressed]="cell.selected"
            (click)="selected.set(cell.date)"
          >
            {{ cell.date.day }}
          </button>
        } @else {
          <span></span>
        }
      }
    </div>
  `,
})
export class MiniCalendar {
  readonly isEnabled = input.required<(day: CalendarDay) => boolean>();
  readonly monthsAhead = input(2);
  readonly selected = model<CalendarDay | null>(null);

  protected readonly weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  private readonly today = bogotaParts(new Date());
  private readonly view = signal({ year: this.today.year, month: this.today.month });

  protected readonly title = computed(() => `${MONTHS[this.view().month - 1]} ${this.view().year}`);

  private readonly offset = computed(() => {
    const { year, month } = this.view();
    return (year - this.today.year) * 12 + (month - this.today.month);
  });

  protected readonly canGoBack = computed(() => this.offset() > 0);
  protected readonly canGoForward = computed(() => this.offset() < this.monthsAhead());

  protected readonly cells = computed(() => {
    const { year, month } = this.view();
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = (firstWeekday + 6) % 7;
    const enabled = this.isEnabled();
    const selected = this.selected();

    const cells: ({ date: CalendarDay; enabled: boolean; today: boolean; selected: boolean } | null)[] =
      Array(leading).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      const date: CalendarDay = { year, month, day, weekday: (firstWeekday + day - 1) % 7 };
      cells.push({ date, enabled: enabled(date), today: sameDay(this.today, date), selected: sameDay(selected, date) });
    }
    return cells;
  });

  protected move(step: number): void {
    this.view.update(({ year, month }) => {
      const index = year * 12 + (month - 1) + step;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }
}
