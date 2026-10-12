import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-how-it-works',
    imports: [RouterLink, Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
        }

        .columns {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.5rem;
            margin-top: 2.5rem;
            text-align: left;
        }

        .column {
            padding: 2rem 1.75rem;
            border: 1px solid var(--c-border);
            border-radius: 16px;
            background: var(--c-surface-2);
            scroll-margin-top: 96px;
        }

        .column h2 {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1.375rem;
            font-weight: 600;
        }

        ol {
            display: grid;
            gap: 1.25rem;
            margin: 1.5rem 0 0;
            padding: 0;
            list-style: none;
            counter-reset: step;
        }

        li {
            display: grid;
            grid-template-columns: 2.25rem 1fr;
            gap: 0.85rem;
            counter-increment: step;
        }

        li::before {
            content: counter(step);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.25rem;
            height: 2.25rem;
            border-radius: 50%;
            background: var(--c-primary);
            color: #fff;
            font-weight: 600;
        }

        li strong {
            display: block;
            font-size: 1.0625rem;
        }

        li span {
            color: var(--c-muted);
        }

        .column .btn {
            width: 100%;
            margin-top: 2rem;
        }

        @media (max-width: 900px) {
            .columns {
                grid-template-columns: 1fr;
            }
        }
    `,

    template: `
        <section class="landing-section">
            <h1 class="section-title">Cómo funciona</h1>
            <p class="section-sub">El paso a paso de una contratación en Confiance.</p>

            <div class="columns">
                <article class="column" id="clientes">
                    <h2>
                        <span class="icon-tile"><app-icon name="user" [size]="22" /></span>
                        Si buscas un servicio
                    </h2>
                    <ol>
                        @for (s of clientSteps; track s.title) {
                            <li>
                                <div>
                                <strong>{{ s.title }}</strong><span>{{ s.text }}</span>
                                </div>
                            </li>
                        }
                    </ol>
                    <a class="btn btn--accent" routerLink="/auth/registro">Quiero contratar</a>
                </article>

                <article class="column" id="prestadores">
                    <h2>
                        <span class="icon-tile"><app-icon name="briefcase" [size]="22" /></span>
                        Si ofreces servicios
                    </h2>
                    <ol>
                        @for (s of providerSteps; track s.title) {
                            <li>
                                <div>
                                    <strong>{{ s.title }}</strong><span>{{ s.text }}</span>
                                </div>
                            </li>
                        }
                    </ol>
                    <a class="btn btn--primary" routerLink="/auth/registro-prestador">
                        Crear perfil de prestador
                    </a>
                </article>
            </div>
        </section>
    `,
})

export class HowItWorks {

    protected readonly clientSteps = [
        {
        title: 'Busca o publica',
        text: 'Explora el catálogo y elige un prestador, o publica tu necesidad para que te contacten.',
        },
        {
        title: 'Envía tu solicitud',
        text: 'Propón fecha, hora, ubicación y valor dentro de la disponibilidad del prestador.',
        },
        {
        title: 'Confirma la contratación',
        text: 'Cuando el prestador acepta y tú confirmas las condiciones, se crea la cita.',
        },
        {
        title: 'Coordina por el chat',
        text: 'Habla con el prestador dentro de Confiance; todo queda registrado.',
        },
        {
        title: 'Confirma y califica',
        text: 'Cuando el prestador termina, confirma que todo salió bien (tienes 24 horas) y califícalo.',
        },
    ];

    protected readonly providerSteps = [
        {
        title: 'Crea tu perfil',
        text: 'Elige hasta 3 oficios, tus zonas de atención y tu disponibilidad semanal.',
        },
        {
        title: 'Verifica tu identidad',
        text: 'Envía tu documento; cuando se aprueba, tu perfil muestra la insignia.',
        },
        {
        title: 'Publica y postúlate',
        text: 'Publica tus servicios o muestra interés en las necesidades de los clientes.',
        },
        {
        title: 'Acepta solicitudes',
        text: 'Revisa cada solicitud y acéptala o recházala; tu horario se reserva al aceptar.',
        },
        {
        title: 'Presta el servicio',
        text: 'Marca el inicio y el final del trabajo, y construye tu reputación con cada calificación.',
        },
    ];
}
