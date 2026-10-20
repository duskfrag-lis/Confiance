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

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[-_]/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');

const ERRORS: Record<string, string> = {
  PRICE_RANGE: 'El precio máximo debe ser mayor o igual que el mínimo.',
  PAST_DATE: 'Elige un día de hoy en adelante.',
};

@Component({
  selector: 'app-search-results',
  imports: [RouterLink, Icon],
  templateUrl: './search-results.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './search-results.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResults {
  private readonly searchService = inject(SearchService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly session = inject(CurrentUserService);

  protected readonly cop = formatCop;
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly ratings = [3, 4, 5];

  private readonly trades = toSignal(inject(AuthService).getTrades(), { initialValue: [] });
  protected readonly communes = toSignal(inject(ProfilesService).zones(), { initialValue: [] });
  private readonly params = toSignal(this.route.queryParams, { initialValue: {} as Params });

  protected readonly results = signal<ListingCard[] | null>(null);
  protected readonly total = signal(0);
  protected readonly suggestion = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly filtersOpen = signal(false);
  protected readonly text = signal('');
  private readonly page = signal(1);
  private request?: Subscription;
  private textTimer?: ReturnType<typeof setTimeout>;
  private priceTimer?: ReturnType<typeof setTimeout>;

  protected readonly today = (() => {
    const t = bogotaParts(new Date());
    return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  })();

  protected readonly categories = computed(() => {
    const seen = new Map<string, string>();
    this.trades().forEach((t) => seen.set(t.groupId, t.group));
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
  protected readonly neighborhoods = computed(() => this.communes().find((c) => c.id === this.communeId())?.barrios ?? []);
  protected readonly selectedCategory = computed(() => {
    const id = this.query().categoriaId;
    return this.categories().some((c) => c.id === id) ? id : null;
  });
  protected readonly selectedTrade = computed(() => this.trades().find((t) => t.id === this.query().categoriaId) ?? null);

  protected readonly activeFilters = computed(() => {
    const q = this.query();
    return [q.comunaId, q.barrioId, q.precioMin, q.precioMax, q.calificacionMin, q.fecha, q.soloVerificados].filter((v) => v !== undefined).length;
  });
  protected readonly anyFilter = computed(() => this.activeFilters() > 0 || !!this.query().q || !!this.query().categoriaId);
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
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.textTimer);
      clearTimeout(this.priceTimer);
    });
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

  protected set(changes: Params): void {
    const next: Params = { ...this.params(), oficio: null, ...changes };
    Object.keys(next).forEach((k) => (next[k] === '' || next[k] === false || next[k] === undefined) && (next[k] = null));
    this.router.navigate([], { queryParams: next, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onText(value: string): void {
    this.text.set(value);
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.set({ q: value.trim() }), 400);
  }

  protected setCommune(id: string): void {
    this.set({ comuna: id, barrio: null });
  }

  protected setPrice(which: 'precioMin' | 'precioMax', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = digitsOnly(input.value);
    input.value = groupThousands(value);
    clearTimeout(this.priceTimer);
    this.priceTimer = setTimeout(() => this.set({ [which]: value }), 500);
  }

  protected clearAll(): void {
    this.text.set('');
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
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
