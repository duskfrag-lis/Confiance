import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';


@Component({

    selector: 'app-final-cta',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
            background: var(--c-surface-3);
            border-top: 1px solid var(--c-border);
        }

        .actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.85rem;
            margin-top: 2rem;
        }

        @media (max-width: 480px) {
            .actions .btn {
                width: 100%;
            }
        }
    `,

    template: `
        <section class="landing-section">
            <h2 class="section-title">Empieza hoy con Confiance</h2>
            <p class="section-sub">Encuentra a quien necesitas o ofrece tus servicios en minutos.</p>

            <div class="actions">
                <!-- TODO: cuando exista la búsqueda (HU-28), llevar a /buscar. -->
                <a class="btn btn--accent" routerLink="/oficios">Buscar un prestador</a>
                <a class="btn btn--outline" routerLink="/auth/registro-prestador">Ofrecer mis servicios</a>
            </div>
        </section>
    `,
})

export class FinalCta {}
