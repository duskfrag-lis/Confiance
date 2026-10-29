import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-hire-ways',
    imports: [RouterLink, Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
            background: var(--c-surface-2);
            border-top: 1px solid var(--c-border);
        }

        .cards {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.25rem;
            margin-top: 2.5rem;
        }

        .card {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem 1.75rem;
            border: 1px solid var(--c-border);
            border-radius: 16px;
            background: var(--c-bg);
        }

        .card h3 {
            margin-top: 1.1rem;
            font-size: 1.3125rem;
            font-weight: 600;
        }

        .card p {
            max-width: 30rem;
            margin-top: 0.6rem;
            color: var(--c-muted);
            font-size: 1.0625rem;
        }

        .card .btn {
            height: 46px;
            margin-top: 1.5rem;
        }

        .text-link {
            margin-top: 2rem;
        }

        @media (max-width: 768px) {
            .cards {
                grid-template-columns: 1fr;
            }
        }
    `,

    template: `
        <section class="landing-section" id="como-funciona">

            <span class="pill"><app-icon name="user" [size]="16" /> Para clientes</span>
            <h2 class="section-title">Dos formas de contratar</h2>
            <p class="section-sub">Elige la que se acomode a tu situación.</p>

            <div class="cards">
                <article class="card">
                    <span class="icon-tile"><app-icon name="search" [size]="30" /></span>
                    <h3>Busca directamente</h3>
                    <p>
                        Explora el catálogo, filtra por zona, precio y calificación, y solicita el servicio al
                        prestador que elijas.
                    </p>
                    <a class="btn btn--outline" routerLink="/buscar">Explorar servicios</a>
                </article>

                <article class="card">
                    <span class="icon-tile"><app-icon name="clipboard" [size]="30" /></span>
                    <h3>Publica tu necesidad</h3>
                    <p>
                        Cuenta qué necesitas, con fotos y presupuesto. Los prestadores interesados se postulan y
                        tú eliges.
                    </p>
                    <a class="btn btn--outline" routerLink="/cliente/necesidades/nueva">Publicar necesidad</a>
                </article>
            </div>

            <a class="text-link" routerLink="/como-funciona">Ver el paso a paso completo</a>
        </section>
    `,
})

export class HireWays {}
