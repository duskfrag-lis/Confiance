import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon, IconName } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-security',
    imports: [Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
        }

        .list {
            display: grid;
            gap: 1rem;
            max-width: 860px;
            margin: 2.5rem auto 0;
            text-align: left;
        }

        .item {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 1.1rem;
            align-items: start;
            padding: 1.5rem;
            border: 1px solid var(--c-border);
            border-radius: 16px;
            background: var(--c-surface-2);
        }

        .item h2 {
            font-size: 1.1875rem;
            font-weight: 600;
        }

        .item p {
            margin-top: 0.4rem;
            color: var(--c-muted);
            line-height: 1.6;
        }

        @media (max-width: 480px) {
            .item {
                grid-template-columns: 1fr;
            }
        }
    `,
    template: `
        <section class="landing-section">
            <h1 class="section-title">Cómo cuidamos tu seguridad</h1>
            <p class="section-sub">Reglas claras que protegen a clientes y prestadores.</p>

            <div class="list">
                @for (i of items; track i.title) {
                    <article class="item">
                        <span class="icon-tile" [class.icon-tile--success]="i.highlight">
                            <app-icon [name]="i.icon" [size]="24" />
                        </span>
                        <div>
                            <h2>{{ i.title }}</h2>
                            <p>{{ i.text }}</p>
                        </div>
                    </article>
                }
            </div>
        </section>
    `,
})

export class Security {

    protected readonly items: { icon: IconName; title: string; text: string; highlight?: boolean }[] =

    [
        {
            icon: 'shield-check',
            title: 'Identidad verificada',
            text: 'El prestador envía fotos de su documento de identidad y un administrador las revisa. La insignia solo aparece cuando la verificación es aprobada. Tu documento nunca se muestra públicamente.',
            highlight: true,
        },

        {
            icon: 'image',
            title: 'Trabajos aprobados',
            text: 'Las fotos de trabajos anteriores que sube un prestador se revisan antes de aparecer en su perfil.',
        },

        {
            icon: 'star',
            title: 'Calificaciones reales',
            text: 'Solo puedes calificar, y ser calificado, cuando la contratación está completada. Cada parte califica una sola vez.',
        },

        {
            icon: 'chat',
            title: 'Chat por contratación',
            text: 'Cliente y prestador hablan dentro de Confiance y el historial se conserva, para que siempre haya un registro de lo acordado.',
        },

        {
            icon: 'clock',
            title: 'Cancelación y reagendamiento',
            text: 'Puedes cancelar hasta 24 horas antes de la cita; después, solo reagendar (máximo 2 veces). Las emergencias o casos de fuerza mayor se pueden cancelar en cualquier momento y se revisan.',
        },

        {
            icon: 'flag',
            title: 'Reclamos con respaldo',
            text: 'Si algo sale mal, crea un reclamo con descripción y hasta 5 fotos. El equipo lo revisa y registra la resolución.',
        },

        {
            icon: 'lock',
            title: 'Datos privados',
            text: 'Tu cédula, teléfono, correo y datos bancarios nunca aparecen en las vistas públicas. Los datos bancarios del prestador solo los ve el cliente con una contratación activa.',
        },
        
        {
            icon: 'info',
            title: 'Pagos por transferencia',
            text: 'Los pagos se hacen por transferencia bancaria con PSE. Confiance nunca te pide datos de tarjeta.',
        },
    ];
}
