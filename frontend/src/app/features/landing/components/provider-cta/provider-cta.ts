import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-provider-cta',
    imports: [RouterLink, Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
            background: var(--c-text);
            color: var(--c-bg);
        }

        .inner {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            align-items: center;
            gap: 4rem;
            max-width: 1200px;
            margin: 0 auto;
            padding: 5rem 1.5rem;
            scroll-margin-top: 80px;
        }

        .pill {
            background: rgba(245, 242, 237, 0.1);
            color: var(--c-warning);
        }

        h2 {
            color: #fff;
            font-size: clamp(1.875rem, 3vw, 2.5rem);
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .lead {
            margin-top: 0.85rem;
            color: rgba(245, 242, 237, 0.75);
            font-size: 1.1875rem;
        }

        ul {
            display: grid;
            gap: 0.85rem;
            margin: 1.75rem 0 0;
            padding: 0;
            list-style: none;
        }

        li {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1.0625rem;
        }

        li app-icon {
            color: var(--c-accent);
        }

        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.85rem;
            margin-top: 2rem;
        }

        .btn--light-outline {
            background: transparent;
            border-color: rgba(245, 242, 237, 0.85);
            color: #fff;
        }

        .btn--light-outline:hover {
            background: rgba(245, 242, 237, 0.1);
        }

        .profile {
            padding: 1.5rem;
            border-radius: 16px;
            background: var(--c-surface-2);
            color: var(--c-text);
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
        }

        .profile__head {
            display: flex;
            justify-content: space-between;
            font-size: 1.0625rem;
            font-weight: 600;
        }

        .bar {

            height: 8px;
            margin-top: 0.85rem;
            border-radius: 999px;
            background: var(--c-border);
            overflow: hidden;
        }

        .bar span {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: var(--c-accent);
        }

        .steps {
            margin-top: 1.25rem;
            gap: 0.75rem;
        }
            
        .steps li {
            font-size: 1rem;
        }

        .steps app-icon {
            color: var(--c-success);
        }
            
        
        .steps .is-pending {
            color: var(--c-muted);
        }

        .steps .is-pending app-icon {
            color: var(--c-muted);
        }

        @media (max-width: 900px) {
            .inner {
                grid-template-columns: 1fr;
                gap: 2.5rem;
                padding: 3.5rem 1.25rem;
            }
        }

        @media (max-width: 480px) {
            .actions .btn {
                width: 100%;
            }
        }
    `,

    template: `
        <section class="inner" id="prestadores">
            <div>
                <span class="pill"><app-icon name="briefcase" [size]="16" /> Para prestadores</span>
                <h2>Haz crecer tu oficio</h2>
                <p class="lead">
                    Muestra tu experiencia, recibe solicitudes y construye una reputación que se vea.
                </p>

                <ul>
                    @for (b of benefits; track b) {
                        <li><app-icon name="check" [size]="18" /> {{ b }}</li>
                    }
                </ul>

                <div class="actions">
                    <a class="btn btn--accent" routerLink="/auth/registro-prestador">Crear perfil de prestador</a>
                    <a class="btn btn--light-outline" routerLink="/como-funciona" fragment="prestadores">
                        Conocer más
                    </a>
                </div>
            </div>

            <div class="profile" aria-hidden="true">
                <div class="profile__head">
                    <span>Tu perfil</span>
                    <span>{{ progress }}%</span>
                </div>
                <div class="bar"><span [style.width.%]="progress"></span></div>

                <ul class="steps">
                    @for (s of profileSteps; track s.label) {
                        <li [class.is-pending]="!s.done">
                            <app-icon [name]="s.done ? 'circle-check' : 'circle'" [size]="22" />
                            {{ s.label }}
                        </li>
                    }
                </ul>
            </div>
        </section>
    `,
})

export class ProviderCta {

    protected readonly benefits = [
        'Perfil profesional con tus oficios y zonas',
        'Solicitudes y necesidades a tu alcance',
        'Agenda con tu disponibilidad semanal',
        'Insignia de identidad verificada',
    ];

    protected readonly profileSteps = [

        { label: 'Oficios y descripción', done: true },
        { label: 'Zonas de atención', done: true },
        { label: 'Disponibilidad semanal', done: true },
        { label: 'Verificar identidad', done: false },
    ];

    protected readonly progress = Math.round(
        (this.profileSteps.filter((s) => s.done).length / this.profileSteps.length) * 100,
    );
}
