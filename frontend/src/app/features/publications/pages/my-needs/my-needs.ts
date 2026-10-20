import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatShortDateTime } from '../../../../shared/utils/format';
import { NEED_STATE_LABEL, Need, NeedState } from '../../models/need.models';
import { NeedsService } from '../../services/needs.service';

type Filter = 'all' | NeedState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'abierta', label: 'Abiertas' },
  { id: 'prestador_seleccionado', label: 'Con prestador' },
  { id: 'cerrada', label: 'Cerradas' },
];

@Component({
  selector: 'app-my-needs',
  imports: [RouterLink, Icon],
  templateUrl: './my-needs.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../_list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyNeedsPage {
  private readonly needs = inject(NeedsService);

  protected readonly stateLabel = NEED_STATE_LABEL;
  protected readonly dateTime = (iso: string) => formatShortDateTime(new Date(iso));

  protected readonly items = signal<Need[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly filter = signal<Filter>('all');
  protected readonly flash = signal<string | null>((history.state as { flash?: string } | null)?.flash ?? null);

  protected readonly filters = computed(() => {
    const list = this.items() ?? [];
    return FILTERS.map((f) => ({ ...f, count: f.id === 'all' ? list.length : list.filter((n) => n.estado === f.id).length }));
  });

  protected readonly visible = computed(() => {
    const list = this.items() ?? [];
    const f = this.filter();
    return f === 'all' ? list : list.filter((n) => n.estado === f);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.needs.listMine().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected budget(n: Need): string {
    return n.presupuestoMin === n.presupuestoMax
      ? formatCop(n.presupuestoMin)
      : `${formatCop(n.presupuestoMin)} a ${formatCop(n.presupuestoMax)}`;
  }
}
