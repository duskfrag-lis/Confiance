import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthService } from '../../services/auth.service';

const MAX_TRADES = 3;
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

@Component({
  selector: 'app-trade-picker',
  imports: [FieldError, Icon],
  templateUrl: './trade-picker.html',
  styleUrl: './trade-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradePicker {
  private readonly auth = inject(AuthService);

  /** ids elegidos; el primero es el oficio principal. Uso: [(selected)]="signal" */
  readonly selected = model<string[]>([]);
  readonly error = input<string | null>(null);

  protected readonly MAX = MAX_TRADES;
  protected readonly trades = toSignal(this.auth.getTrades(), { initialValue: [] });
  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const q = normalize(this.search());
    return q ? this.trades().filter((t) => normalize(t.name).includes(q)) : this.trades();
  });

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    const current = this.selected();
    this.selected.set(
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < MAX_TRADES
          ? [...current, id]
          : current,
    );
  }
}
