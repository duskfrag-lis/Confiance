import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { tradeById } from '../../../../shared/data/trade-catalog';
import { bogotaParts, digitsOnly, formatCop, groupThousands } from '../../../../shared/utils/format';
import { AuthService } from '../../../auth/services/auth.service';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { ListingCard, SearchQuery } from '../../models/search.models';
import { SearchService } from '../../services/search.service';

type Panel = 'category' | 'zone' | 'price' | 'rating' | 'date';

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[-_]/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const shortDay = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const compactCop = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString('es-CO')} M` : `$${Math.round(v / 1000)} mil`);

const ERRORS: Record<string, string> = {
  PRICE_RANGE: 'El precio máximo debe ser mayor o igual que el mínimo.',
  PAST_DATE: 'Elige un día de hoy en adelante.',
};

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Hasta $100 mil', max: 100_000 },
  { label: '$100 mil a $300 mil', min: 100_000, max: 300_000 },
  { label: '$300 mil a $1 M', min: 300_000, max: 1_000_000 },
  { label: 'Más de $1 M', min: 1_000_000 },
];

@Component({
  selector: 'app-search-results',
  imports: [RouterLink, Icon],
  templateUrl: './search-results.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './search-results.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'openPanel.set(null)',
  },
})
export class SearchResults {
  private readonly searchService = inject(SearchService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly session = inject(CurrentUserService);

  protected readonly cop = formatCop;
  protected readonly ratings = [5, 4, 3, 2, 1];
  protected readonly pricePresets = PRICE_PRESETS;

  private readonly trades = toSignal(inject(AuthService).getTrades(), { initialValue: [] });
  protected readonly communes = toSignal(inject(ProfilesService).zones(), { initialValue: [] });
  private readonly params = toSignal(this.route.queryParams, { initialValue: {} as Params });

  protected readonly results = signal<ListingCard[] | null>(null);
  protected readonly total = signal(0);
  protected readonly suggestion = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly text = signal('');
  protected readonly openPanel = signal<Panel | null>(null);
  protected readonly tradeQuery = signal('');
  protected readonly minDraft = signal('');
  protected readonly maxDraft = signal('');
  protected readonly zoneCommune = signal('');
  private readonly page = signal(1);
  private request?: Subscription;
  private textTimer?: ReturnType<typeof setTimeout>;

  protected readonly inPanel = this.router.url.startsWith('/cliente');
  protected readonly brokenPhotos = signal(new Set<string>());

  protected readonly today = (() => {
    const t = bogotaParts(new Date());
    return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  })();

  protected readonly nextDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(new Date(`${this.today}T12:00:00Z`).getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    return { key, label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : shortDay.format(d).replace(/\./g, '') };
  });

  protected readonly categoryGroups = computed(() => {
    const q = normalize(this.tradeQuery());
    const groups = new Map<string, { id: string; name: string; trades: { id: string; name: string }[] }>();
    for (const t of this.trades()) {
      const matches = !q || normalize(t.name).includes(q) || normalize(t.group).includes(q);
      if (!matches) continue;
      const g = groups.get(t.groupId) ?? { id: t.groupId, name: t.group, trades: [] };
      g.trades.push({ id: t.id, name: t.name });
      groups.set(t.groupId, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly query = computed<SearchQuery>(() => {
    const p = this.params();
    let q = (p['q'] as string) ?? '';
    let categoriaId = (p['categoria'] as string) ?? '';
    let comunaId = (p['comuna'] as string) ?? '';
    let barrioId = (p['barrio'] as string) ?? '';

    const legacyTrade = p['oficio'] as string | undefined;
    if (legacyTrade && !categoriaId) {
      const name = tradeById(legacyTrade)?.name ?? legacyTrade;
      const match = this.trades().find((t) => normalize(t.name) === normalize(name));
      if (match) categoriaId = match.id;
      else q ||= name;
    }
    if (comunaId && !/^\d+$/.test(comunaId)) {
      const wanted = normalize(comunaId);
      comunaId = this.communes().find((c) => normalize(c.nombre) === wanted || normalize(c.nombre).split(',')[0] === wanted)?.id ?? '';
    }
    if (barrioId && !/^\d+$/.test(barrioId)) {
      barrioId = this.communes().flatMap((c) => c.barrios).find((b) => normalize(b.nombre) === normalize(barrioId))?.id ?? '';
    }

    return {
      q: q.trim() || undefined,
      categoriaId: categoriaId || undefined,
      ...(barrioId ? { barrioId } : { comunaId: comunaId || undefined }),
      precioMin: p['precioMin'] ? Number(p['precioMin']) : undefined,
      precioMax: p['precioMax'] ? Number(p['precioMax']) : undefined,
      calificacionMin: p['calificacion'] ? Number(p['calificacion']) : undefined,
      fecha: (p['fecha'] as string) || undefined,
      soloVerificados: p['verificados'] === 'true' || undefined,
    };
  });

  protected readonly communeId = computed(() => {
    const q = this.query();
    if (q.comunaId) return q.comunaId;
    return q.barrioId ? (this.communes().find((c) => c.barrios.some((b) => b.id === q.barrioId))?.id ?? '') : '';
  });
  protected readonly zoneNeighborhoods = computed(() => this.communes().find((c) => c.id === this.zoneCommune())?.barrios ?? []);

  protected readonly labels = computed(() => {
    const q = this.query();
    const trade = this.trades().find((t) => t.id === q.categoriaId);
    const category = this.trades().find((t) => t.groupId === q.categoriaId);
    const commune = this.communes().find((c) => c.id === this.communeId());
    const neighborhood = commune?.barrios.find((b) => b.id === q.barrioId);
    const day = this.nextDays.find((d) => d.key === q.fecha);
    return {
      category: trade?.name ?? category?.group ?? null,
      zone: neighborhood?.nombre ?? commune?.nombre ?? null,
      price:
        q.precioMin && q.precioMax
          ? `${compactCop(q.precioMin)} a ${compactCop(q.precioMax)}`
          : q.precioMin
            ? `Desde ${compactCop(q.precioMin)}`
            : q.precioMax
              ? `Hasta ${compactCop(q.precioMax)}`
              : null,
      rating: q.calificacionMin ? (q.calificacionMin === 5 ? '5 estrellas' : `${q.calificacionMin} o más`) : null,
      date: q.fecha ? (day?.label ?? shortDay.format(new Date(`${q.fecha}T12:00:00Z`)).replace(/\./g, '')) : null,
    };
  });

  protected readonly anyFilter = computed(() => {
    const q = this.query();
    return Object.values(q).some((v) => v !== undefined);
  });
  protected readonly hasMore = computed(() => (this.results()?.length ?? 0) < this.total());
  protected readonly order = computed(() => (!this.anyFilter() ? 'más recientes' : this.query().q ? 'relevancia' : 'mejor calificados'));

  constructor() {
    effect(() => {
      const q = this.query();
      untracked(() => {
        if (normalize(this.text()) !== normalize(q.q ?? '')) this.text.set(q.q ?? '');
        this.run(q);
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.textTimer));
  }

  private run(query: SearchQuery, more = false): void {
    this.request?.unsubscribe();
    const pagina = more ? this.page() + 1 : 1;
    this.error.set(null);
    if (more) this.loadingMore.set(true);
    else this.results.set(null);

    this.request = this.searchService
      .search({ ...query, pagina })
      .pipe(finalize(() => this.loadingMore.set(false)))
      .subscribe({
        next: (res) => {
          this.page.set(pagina);
          this.total.set(res.total);
          this.suggestion.set(res.sugerencia === 'publicar_necesidad' || (!res.total && this.anyFilter()));
          this.results.update((list) => (more ? [...(list ?? []), ...res.resultados] : res.resultados));
        },
        error: (e) => {
          this.results.set([]);
          this.total.set(0);
          this.error.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos cargar los servicios. Inténtalo de nuevo.');
        },
      });
  }

  protected loadMore(): void {
    this.run(this.query(), true);
  }

  protected set(changes: Params, close = true): void {
    const next: Params = { ...this.params(), oficio: null, ...changes };
    Object.keys(next).forEach((k) => (next[k] === '' || next[k] === false || next[k] === undefined) && (next[k] = null));
    this.router.navigate([], { queryParams: next, queryParamsHandling: 'merge', replaceUrl: true });
    if (close) this.openPanel.set(null);
  }

  protected toggle(panel: Panel, event: Event): void {
    event.stopPropagation();
    const opening = this.openPanel() !== panel;
    this.openPanel.set(opening ? panel : null);
    if (!opening) return;
    if (panel === 'category') this.tradeQuery.set('');
    if (panel === 'zone') this.zoneCommune.set(this.communeId());
    if (panel === 'price') {
      this.minDraft.set(this.money(this.query().precioMin));
      this.maxDraft.set(this.money(this.query().precioMax));
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.openPanel() && !target?.closest('.filter-item')) this.openPanel.set(null);
  }

  protected onText(value: string): void {
    this.text.set(value);
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.set({ q: value.trim() }, false), 400);
  }

  protected setDraft(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = groupThousands(digitsOnly(input.value));
    (which === 'min' ? this.minDraft : this.maxDraft).set(value);
    input.value = value;
  }

  protected applyPrice(): void {
    this.set({ precioMin: digitsOnly(this.minDraft()), precioMax: digitsOnly(this.maxDraft()) });
  }

  protected applyPreset(p: { min?: number; max?: number }): void {
    this.set({ precioMin: p.min ? String(p.min) : null, precioMax: p.max ? String(p.max) : null });
  }

  protected clearAll(): void {
    this.text.set('');
    this.openPanel.set(null);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected photoFailed(id: string): void {
    this.brokenPhotos.update((set) => new Set(set).add(id));
  }

  protected money(value?: number): string {
    return value ? groupThousands(String(value)) : '';
  }

  protected price(c: ListingCard): string {
    return c.precioFijo ? this.cop(c.precioMin) : `${this.cop(c.precioMin)} a ${this.cop(c.precioMax)}`;
  }

  protected readonly needLink = computed(() => {
    const u = this.session.current();
    if (!u) return { link: '/auth/iniciar-sesion', query: { volver: '/cliente/necesidades/nueva' } };
    return { link: u.perfilActivo === 'client' ? '/cliente/necesidades/nueva' : '/prestador/cambiar-perfil', query: {} };
  });
}
