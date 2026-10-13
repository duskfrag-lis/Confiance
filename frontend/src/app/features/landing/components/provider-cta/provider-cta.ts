import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { ProfilePreview } from '../profile-preview/profile-preview';

@Component({

    selector: 'app-provider-cta',
    imports: [RouterLink, Icon, ProfilePreview],
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
            background: color-mix(in srgb, var(--c-bg) 10%, transparent);
            color: var(--c-warning);
        }

        h2 {
            color: var(--c-white);
            font-size: clamp(1.875rem, 3vw, 2.5rem);
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .lead {
            margin-top: 0.85rem;
            color: color-mix(in srgb, var(--c-bg) 75%, transparent);
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
                    <a class="btn btn--light-outline" routerLink="/prestadores">
                        Conocer más
                    </a>
                </div>
            </div>

            <app-profile-preview />
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
}
