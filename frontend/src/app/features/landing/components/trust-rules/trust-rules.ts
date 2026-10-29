import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-trust-rules',
    imports: [RouterLink, Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
            border-top: 1px solid var(--c-border);
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1.25rem;
            margin-top: 2.5rem;
        }

        .card {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 1.75rem 1.5rem;
            border: 1px solid var(--c-border);
            border-radius: 16px;
            background: var(--c-surface-2);
        }

        .card h3 {
            margin-top: 1rem;
            font-size: 1.1875rem;
            font-weight: 600;
        }

        .card p {
            margin-top: 0.5rem;
            color: var(--c-muted);
        }

        .notice {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
            margin-top: 1.5rem;
            padding: 1rem 1.25rem;
            border-radius: 12px;
            background: var(--c-surface-3);
            color: var(--c-text);
        }

        .notice app-icon {
            color: var(--c-primary);
        }

        .text-link {
            margin-top: 2rem;
        }

        @media (max-width: 1024px) {
            .grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }

        @media (max-width: 600px) {
            .grid {
                grid-template-columns: 1fr;
            }
            .notice {
                align-items: flex-start;
                text-align: left;
            }
        }
    `,

    template: `
        <section class="landing-section" id="seguridad">
            <h2 class="section-title">Confianza en cada paso</h2>
            <p class="section-sub">Reglas claras para clientes y prestadores.</p>

            <div class="grid">
                @for (r of rules; track r.title) {
                    <article class="card">
                        <span class="icon-tile">
                        <app-icon [name]="r.icon" [size]="30" />
                        </span>
                        <h3>{{ r.title }}</h3>
                        <p>{{ r.text }}</p>
                    </article>
                }
            </div>

            <p class="notice">
                <app-icon name="info" [size]="20" />
                Pagas al final, por PSE o por transferencia al prestador. Confiance nunca te pide datos de tarjeta.
            </p>

            <a class="text-link" routerLink="/seguridad">Conoce cómo cuidamos tu seguridad</a>
        </section>
    `,
})

export class TrustRules {

  protected readonly rules: { icon: IconName; title: string; text: string; highlight?: boolean }[] =
    [

      {
        icon: 'shield-check',
        title: 'Identidad verificada',
        text: 'Un administrador revisa el documento antes de mostrar la insignia.',
        highlight: true,
      },
      
      {
        icon: 'images',
        title: 'Trabajos realizados',
        text: 'Mira fotos de trabajos anteriores de cada prestador.',
      },

      {
        icon: 'star',
        title: 'Calificaciones reales',
        text: 'Solo califican quienes completaron el servicio.',
      },

      {
        icon: 'chat',
        title: 'Chat interno',
        text: 'Coordina detalles dentro de Confiance y deja todo registrado.',
      },

      {
        icon: 'calendar-x',
        title: 'Cancelación clara',
        text: 'Cancela hasta 24 horas antes. Después, solicita reagendar.',
      },

      {
        icon: 'flag',
        title: 'Reclamos con respaldo',
        text: 'Reporta un problema con evidencia y el equipo lo revisa.',
      },
      
    ];
}
