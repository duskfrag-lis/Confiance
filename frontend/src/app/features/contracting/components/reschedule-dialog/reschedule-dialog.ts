import { ChangeDetectionStrategy, Component, ElementRef, computed, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';
import { CalendarDay, MiniCalendar } from '../../../../shared/components/mini-calendar/mini-calendar';
import { bogotaDate, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { TimeBlock } from '../../models/contract';
import { BLOCK_HOURS, BLOCK_LABEL } from '../../services/provider-contracts.service';

export interface RescheduleConfig {
  current: Date;
  left: number;
  counterpart: string;
  availability: Record<number, TimeBlock[]>;
  isTaken: (date: Date, block: TimeBlock) => boolean;
}

const BLOCKS: TimeBlock[] = ['morning', 'afternoon', 'evening'];

const hourLabel = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;

@Component({
  selector: 'app-reschedule-dialog',
  imports: [Icon, MiniCalendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .dialog {
      width: min(560px, calc(100% - 2rem));
    }
    .current {
      color: var(--c-muted);
      strong {
        color: var(--c-text);
      }
    }
    .step {
      display: grid;
      gap: 0.5rem;
      h3 {
        font-size: 1rem;
        font-weight: 600;
      }
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .chip {
      height: 40px;
      padding: 0 1rem;
      border: 1px solid var(--c-border);
      border-radius: 999px;
      background: var(--c-white);
      color: var(--c-text);
      font-weight: 600;
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-out);

      &:hover:not(:disabled):not(.is-selected) {
        background: var(--c-primary-soft);
      }
      &.is-selected {
        border-color: var(--c-primary);
        background: var(--c-primary);
        color: var(--c-white);
      }
      &:disabled {
        color: var(--c-muted);
        text-decoration: line-through;
        cursor: default;
        opacity: 0.6;
      }
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.8rem 0.95rem;
      border-radius: 12px;
      background: var(--c-primary-soft);
      color: var(--c-primary-dark);
      font-weight: 600;
    }
  `,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)">
      <form class="dialog__form" (submit)="submit($event)">
        <header class="dialog__head">
          <div>
            <h2>Solicitar nuevo horario</h2>
            <p>{{ counterpart() }} debe aceptarlo. Te quedan {{ left() }} de 2 solicitudes.</p>
          </div>
          <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </header>

        @if (current(); as cur) {
          <p class="current">Horario actual: <strong>{{ shortDate(cur) }}</strong></p>
        }

        <div class="step">
          <h3>1. Elige el día</h3>
          <app-mini-calendar [isEnabled]="isDayEnabled" [selected]="day()" (selectedChange)="pickDay($event)" />
        </div>

        @if (day()) {
          <div class="step">
            <h3>2. Elige el bloque</h3>
            <div class="chips">
              @for (b of blocks(); track b.block) {
                <button
                  type="button"
                  class="chip"
                  [class.is-selected]="block() === b.block"
                  [disabled]="!b.free"
                  (click)="pickBlock(b.block)"
                >
                  {{ b.label }}
                </button>
              }
            </div>
          </div>
        }

        @if (block()) {
          <div class="step">
            <h3>3. Elige la hora</h3>
            <div class="chips">
              @for (h of hours(); track h.hour) {
                <button
                  type="button"
                  class="chip"
                  [class.is-selected]="hour() === h.hour"
                  [disabled]="!h.future"
                  (click)="hour.set(h.hour)"
                >
                  {{ h.label }}
                </button>
              }
            </div>
          </div>
        }

        @if (proposed(); as p) {
          <p class="summary"><app-icon name="calendar-check" [size]="20" /> {{ longDate(p) }}</p>
        }

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
          <button type="submit" class="btn btn--primary btn--sm" [disabled]="!proposed()">Enviar solicitud</button>
        </footer>
      </form>
    </dialog>
  `,
})

export class RescheduleDialog {
  readonly confirmed = output<Date>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private config: RescheduleConfig | null = null;
  protected readonly counterpart = signal('');
  protected readonly current = signal<Date | null>(null);
  protected readonly left = signal(2);
  protected readonly day = signal<CalendarDay | null>(null);
  protected readonly block = signal<TimeBlock | null>(null);
  protected readonly hour = signal<number | null>(null);

  protected readonly shortDate = formatShortDateTime;
  protected readonly longDate = formatLongDateTime;

  protected readonly isDayEnabled = (d: CalendarDay): boolean =>
    this.blocksFor(d).some((b) => b.free && b.hours.some((h) => h.future));

  protected readonly blocks = computed(() => {
    const d = this.day();
    return d ? this.blocksFor(d).map((b) => ({ ...b, free: b.free && b.hours.some((h) => h.future) })) : [];
  });

  protected readonly hours = computed(() => {
    const b = this.block();
    return this.blocks().find((x) => x.block === b)?.hours ?? [];
  });

  private blocksFor(d: CalendarDay) {
    const offered = this.config?.availability[d.weekday] ?? [];
    const date = bogotaDate(d.year, d.month, d.day, 12);
    const now = Date.now();
    return BLOCKS.filter((b) => offered.includes(b)).map((b) => {
      const [from, to] = BLOCK_HOURS[b];
      return {
        block: b,
        label: `${BLOCK_LABEL[b]} (${hourLabel(from)} a ${hourLabel(to)})`,
        free: !this.config?.isTaken(date, b),
        hours: Array.from({ length: to - from }, (_, i) => from + i).map((hour) => ({
          hour,
          label: hourLabel(hour),
          future: bogotaDate(d.year, d.month, d.day, hour).getTime() > now,
        })),
      };
    });
  }

  protected readonly proposed = computed(() => {
    const d = this.day();
    const h = this.hour();
    if (!d || h === null) return null;
    const date = bogotaDate(d.year, d.month, d.day, h);
    return date.getTime() === this.current()?.getTime() ? null : date;
  });

  open(config: RescheduleConfig): void {
    this.config = config;
    this.counterpart.set(config.counterpart);
    this.current.set(config.current);
    this.left.set(config.left);
    this.day.set(null);
    this.block.set(null);
    this.hour.set(null);
    this.dialog().nativeElement.showModal();
  }

  protected pickDay(day: CalendarDay | null): void {
    this.day.set(day);
    this.block.set(null);
    this.hour.set(null);
  }

  protected pickBlock(block: TimeBlock): void {
    this.block.set(block);
    this.hour.set(null);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const p = this.proposed();
    if (!p) return;
    this.confirmed.emit(p);
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
