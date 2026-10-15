import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { ALL_TRADES, TRADE_GROUPS, TradeItem } from '../../../../shared/data/trade-catalog';
import { COMMUNES, communeById } from '../../../../shared/data/zone-catalog';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/**
 * Página de Oficios: buscador, filtro por categoría y zona (HU-28, HU-30).
 * "Ver prestadores" lleva al listado público de /buscar con el oficio y la zona elegidos.
 */
@Component({
  selector: 'app-trades',
  imports: [RouterLink, Icon],
  templateUrl: './trades.html',
  styleUrl: './trades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trades {
  private readonly router = inject(Router);

  protected readonly groups = TRADE_GROUPS;
  protected readonly communes = COMMUNES;

  protected readonly query = signal('');
  protected readonly groupId = signal<string | null>(null);
  protected readonly communeId = signal<string | null>(null);
  protected readonly neighborhood = signal<string | null>(null);

  protected readonly commune = computed(() => communeById(this.communeId()));

  protected readonly trades = computed(() => {
    const q = normalize(this.query());
    const group = this.groups.find((g) => g.id === this.groupId());
    const source = group ? group.trades : ALL_TRADES;

    return q
      ? source.filter((t) => normalize(`${t.name} ${t.description}`).includes(q))
      : source;
  });

  /** Parámetros de zona para el listado de prestadores (solo los elegidos). */
  protected readonly zoneParams = computed(() => ({
    ...(this.communeId() ? { comuna: this.communeId() } : {}),
    ...(this.neighborhood() ? { barrio: this.neighborhood() } : {}),
  }));

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onCommune(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.communeId.set(id || null);
    this.neighborhood.set(null);
  }

  protected toggleNeighborhood(name: string): void {
    this.neighborhood.update((current) => (current === name ? null : name));
  }

  protected search(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    this.router.navigate(['/buscar'], {
      queryParams: { ...(q ? { q } : {}), ...this.zoneParams() },
    });
  }

  protected providersParams(trade: TradeItem) {
    return { oficio: trade.id, ...this.zoneParams() };
  }
}
