import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { TradeView, normalize } from '../../../../shared/data/trade-catalog';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { TradeCatalogService } from '../../services/trade-catalog.service';

/**
 * Página de Oficios: buscador, filtro por categoría y zona (HU-31, HU-33).
 * "Ver prestadores" lleva al listado público de /buscar con el oficio y la zona elegidos.
 */
@Component({
  selector: 'app-trades',
  imports: [RouterLink, NgTemplateOutlet, Icon],
  templateUrl: './trades.html',
  styleUrl: './trades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trades {
  private readonly router = inject(Router);

  protected readonly groups = toSignal(inject(TradeCatalogService).groups$);
  protected readonly communes = toSignal(inject(ProfilesService).zones().pipe(catchError(() => of([]))), { initialValue: [] });

  protected readonly query = signal('');
  protected readonly groupId = signal<string | null>(null);
  protected readonly communeId = signal<string | null>(null);
  protected readonly neighborhoodId = signal<string | null>(null);

  protected readonly commune = computed(() => this.communes().find((c) => c.id === this.communeId()));

  protected readonly trades = computed(() => {
    const q = normalize(this.query());
    const groups = this.groups() ?? [];
    const source = (this.groupId() ? groups.filter((g) => g.id === this.groupId()) : groups).flatMap((g) => g.trades);
    return q ? source.filter((t) => normalize(`${t.name} ${t.description}`).includes(q)) : source;
  });

  /** Parámetros de zona para el listado de prestadores (solo los elegidos). */
  protected readonly zoneParams = computed(() => ({
    ...(this.communeId() ? { comuna: this.communeId() } : {}),
    ...(this.neighborhoodId() ? { barrio: this.neighborhoodId() } : {}),
  }));

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onCommune(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.communeId.set(id || null);
    this.neighborhoodId.set(null);
  }

  protected toggleNeighborhood(id: string): void {
    this.neighborhoodId.update((current) => (current === id ? null : id));
  }

  protected search(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    this.router.navigate(['/buscar'], {
      queryParams: { ...(q ? { q } : {}), ...this.zoneParams() },
    });
  }

  protected providersParams(trade: TradeView) {
    return { categoria: trade.id, ...this.zoneParams() };
  }
}
