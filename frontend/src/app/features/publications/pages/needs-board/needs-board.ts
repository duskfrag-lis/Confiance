import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatShortDateTime } from '../../../../shared/utils/format';
import { AuthService } from '../../../auth/services/auth.service';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { BoardNeed, INTEREST_STATE_LABEL, MyInterest } from '../../models/need.models';
import { NeedsService } from '../../services/needs.service';

type Tab = 'board' | 'interests';

@Component({
  selector: 'app-needs-board',
  imports: [RouterLink, Icon],
  templateUrl: './needs-board.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../_list.scss', './needs-board.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedsBoardPage {
  private readonly needs = inject(NeedsService);

  protected readonly interestLabel = INTEREST_STATE_LABEL;
  protected readonly dateTime = (iso: string) => formatShortDateTime(new Date(iso));

  private readonly trades = toSignal(inject(AuthService).getTrades(), { initialValue: [] });
  protected readonly communes = toSignal(inject(ProfilesService).zones(), { initialValue: [] });

  protected readonly tab = signal<Tab>('board');
  protected readonly categoryId = signal('');
  protected readonly communeId = signal('');
  protected readonly neighborhoodId = signal('');

  protected readonly results = signal<BoardNeed[] | null>(null);
  protected readonly total = signal(0);
  private readonly page = signal(1);
  protected readonly loadingMore = signal(false);
  protected readonly loadError = signal(false);

  protected readonly interests = signal<MyInterest[] | null>(null);
  protected readonly interestsError = signal(false);

  private request?: Subscription;

  protected readonly categories = computed(() => {
    const groups = new Map<string, { id: string; name: string; trades: { id: string; name: string }[] }>();
    for (const t of this.trades()) {
      const g = groups.get(t.groupId) ?? { id: t.groupId, name: t.group, trades: [] };
      g.trades.push({ id: t.id, name: t.name });
      groups.set(t.groupId, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly neighborhoods = computed(() => this.communes().find((c) => c.id === this.communeId())?.barrios ?? []);
  protected readonly interestedIn = computed(() => new Set((this.interests() ?? []).map((i) => i.necesidad.id)));
  protected readonly hasMore = computed(() => (this.results()?.length ?? 0) < this.total());
  protected readonly filtered = computed(() => !!(this.categoryId() || this.communeId()));

  constructor() {
    effect(() => {
      const query = { categoriaId: this.categoryId(), comunaId: this.communeId(), barrioId: this.neighborhoodId() };
      untracked(() => this.search(query));
    });
    this.loadInterests();
  }

  private search(query: { categoriaId: string; comunaId: string; barrioId: string }, more = false): void {
    this.request?.unsubscribe();
    const page = more ? this.page() + 1 : 1;
    const params = { categoriaId: query.categoriaId, ...(query.barrioId ? { barrioId: query.barrioId } : { comunaId: query.comunaId }), pagina: page };
    this.loadError.set(false);
    if (more) this.loadingMore.set(true);
    else this.results.set(null);

    this.request = this.needs
      .board(params)
      .pipe(finalize(() => this.loadingMore.set(false)))
      .subscribe({
        next: (res) => {
          this.page.set(page);
          this.total.set(res.total);
          this.results.update((list) => (more ? [...(list ?? []), ...res.resultados] : res.resultados));
        },
        error: () => this.loadError.set(true),
      });
  }

  protected loadMore(): void {
    this.search({ categoriaId: this.categoryId(), comunaId: this.communeId(), barrioId: this.neighborhoodId() }, true);
  }

  protected retry(): void {
    this.search({ categoriaId: this.categoryId(), comunaId: this.communeId(), barrioId: this.neighborhoodId() });
  }

  protected loadInterests(): void {
    this.interestsError.set(false);
    this.needs.myInterests().subscribe({
      next: (list) => this.interests.set(list),
      error: () => this.interestsError.set(true),
    });
  }

  protected setCommune(id: string): void {
    this.communeId.set(id);
    this.neighborhoodId.set('');
  }

  protected clearFilters(): void {
    this.categoryId.set('');
    this.setCommune('');
  }

  protected budget(n: BoardNeed): string {
    return n.presupuestoMin === n.presupuestoMax
      ? formatCop(n.presupuestoMin)
      : `${formatCop(n.presupuestoMin)} a ${formatCop(n.presupuestoMax)}`;
  }

  protected price(value: number | null): string | null {
    return value ? formatCop(value) : null;
  }

  protected startsOthers(index: number): boolean {
    const list = this.results() ?? [];
    return list[index]?.deTuOficio === false && (index === 0 ? false : list[index - 1].deTuOficio !== false);
  }
}
