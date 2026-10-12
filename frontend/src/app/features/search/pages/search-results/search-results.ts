import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { tradeById } from '../../../../shared/data/trade-catalog';
import { communeById } from '../../../../shared/data/zone-catalog';

/**
 * Listado público de prestadores (HU-28 a HU-30). No requiere sesión: solo se
 * pide al contratar. Temporal: muestra lo que se buscó hasta que exista el backend
 * y el diseño del listado.
 */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    h1 {
      font-size: clamp(1.875rem, 3.4vw, 2.625rem);
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.25rem;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.9rem;
      border: 1px solid var(--c-border);
      border-radius: 999px;
      background: var(--c-white);
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      max-width: 560px;
      margin: 2.5rem auto 0;
      padding: 2.5rem 1.5rem;
      border: 1px dashed var(--c-border);
      border-radius: 16px;
      background: var(--c-surface-2);
      color: var(--c-muted);
    }
    .empty .btn {
      margin-top: 0.75rem;
    }
  `,
  template: `
    <section class="landing-section">
      <h1>{{ title() }}</h1>

      @if (zone()) {
        <div class="tags">
          <span class="tag"><app-icon name="map-pin" [size]="16" /> {{ zone() }}</span>
        </div>
      }

      <div class="empty">
        <span class="icon-tile"><app-icon name="search" [size]="24" /></span>
        <p>Aquí verás los prestadores disponibles, con su calificación y verificación.</p>
        <a class="btn btn--outline" routerLink="/oficios">Volver a oficios</a>
      </div>
    </section>
  `,
})
export class SearchResults {
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly title = computed(() => {
    const trade = tradeById(this.params().get('oficio'));
    const q = this.params().get('q');
    if (trade) return `Prestadores de ${trade.name}`;
    if (q) return `Resultados para «${q}»`;
    return 'Prestadores';
  });

  protected readonly zone = computed(() => {
    const commune = communeById(this.params().get('comuna'));
    const neighborhood = this.params().get('barrio');
    if (!commune) return null;
    return neighborhood ? `${neighborhood}, ${commune.name}` : commune.name;
  });
}
