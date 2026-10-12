import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { TRADE_GROUPS } from '../../../../shared/data/trade-catalog';

/**
 * Página de Oficios: el catálogo completo por categoría.
 * Temporal: cuando exista la búsqueda (HU-28) cada oficio llevará a sus prestadores.
 */
@Component({

    selector: 'app-trades',
    imports: [RouterLink, Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
            max-width: 1200px;
            margin: 0 auto;
            padding: 3.5rem 1.5rem 5rem;
        }

        .head {
            text-align: center;
        }

        h1 {

            font-size: clamp(1.875rem, 3vw, 2.5rem);
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .sub {
            margin-top: 0.75rem;
            color: var(--c-muted);
            font-size: 1.125rem;
        }

        .group {
            margin-top: 2.5rem;
        }

        h2 {
            margin-bottom: 1rem;
            color: var(--c-primary);
            font-size: 1.25rem;
            font-weight: 600;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 1rem;
        }

        .trade {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            min-height: 64px;
            padding: 0.85rem 1.1rem;
            border: 1px solid var(--c-border);
            border-radius: 12px;
            background: var(--c-surface-2);
            color: var(--c-text);
            font-weight: 600;
            text-decoration: none;
        }

        .trade app-icon {
            color: var(--c-primary);
        }

        .trade:hover,
        .trade.is-selected {
            border-color: var(--c-primary);
            background: var(--c-surface-3);
        }

        @media (max-width: 900px) {

            .grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }

        @media (max-width: 480px) {

            :host {
                padding: 2.5rem 1rem 4rem;
            }
            .grid {
                grid-template-columns: 1fr;
            }
        }
    `,

    template: `
        <header class="head">
            <h1>Oficios</h1>
            <p class="sub">Todos los oficios disponibles en Confiance, organizados por categoría.</p>
        </header>

        @for (group of groups; track group.name) {

            <section class="group">
                <h2>{{ group.name }}</h2>

                <div class="grid">

                    @for (t of group.trades; track t.id) {
                        <a
                            class="trade"
                            routerLink="/oficios"
                            [queryParams]="{ oficio: t.id }"
                            [class.is-selected]="selected() === t.id"
                        >
                            <app-icon [name]="t.icon" [size]="22" />
                            {{ t.name }}
                        </a>
                    }
                </div>
            </section>
        }
    `,
})

export class Trades {

    protected readonly groups = TRADE_GROUPS;
    protected readonly selected = toSignal(
        inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('oficio'))),
    );
}
