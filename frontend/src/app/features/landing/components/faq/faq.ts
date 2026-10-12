import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({

    selector: 'app-faq',
    imports: [Icon],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: block;
        }

        .list {
            max-width: 760px;
            margin: 2.5rem auto 0;
            text-align: left;
        }

        details {
            border-bottom: 1px solid var(--c-border);
        }

        summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1.25rem 0;
            font-size: 1.125rem;
            font-weight: 600;
            list-style: none;
            cursor: pointer;
        }

        summary::-webkit-details-marker {
            display: none;
        }

        summary:focus-visible {
            outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
            outline-offset: 2px;
            border-radius: 6px;
        }

        summary app-icon {
            color: var(--c-primary);
            transition: transform 0.2s;
        }

        details[open] summary app-icon {
            transform: rotate(180deg);
        }

        details p {
            max-width: 42rem;
            padding-bottom: 1.25rem;
            color: var(--c-muted);
            font-size: 1.0625rem;
            line-height: 1.65;
        }
    `,
    
    template: `
        <section class="landing-section" id="preguntas">
            <h2 class="section-title">Preguntas frecuentes</h2>

            <div class="list">
                @for (q of questions; track q.question; let first = $first) {
                    <details [open]="first">
                        <summary>
                            {{ q.question }}
                            <app-icon name="caret-down" [size]="18" />
                        </summary>
                        <p>{{ q.answer }}</p>
                    </details>
                }
            </div>
        </section>
    `,
})

export class Faq {

    protected readonly questions = [
        
        {
            question: '¿Cuánto cuesta usar Confiance?',
            answer: 'Crear tu cuenta y explorar servicios no tiene costo.',
        },

        {
            question: '¿Cómo se paga el servicio?',
            answer:
                'Acuerdas el valor con el prestador y pagas por transferencia bancaria con PSE. No se usan tarjetas de crédito.',
        },

        {
            question: '¿Cómo sé que un prestador es confiable?',
            answer:
                'Revisa su insignia de identidad verificada, sus calificaciones, los trabajos aprobados y los servicios completados.',
        },

        {
            question: '¿Puedo cancelar una contratación?',
            answer:
                'Sí, hasta 24 horas antes de la cita. Después de ese plazo puedes solicitar un nuevo horario. Si se trata de una emergencia o fuerza mayor, puedes cancelar en cualquier momento y el caso se revisa.',
        },

        {
            question: '¿En qué zonas funciona?',
            answer:
                'Empezamos en nuestra ciudad piloto. Cada prestador elige las comunas y barrios donde atiende.',
        },

        {
            question: '¿Cómo deshabilito mi cuenta?',
            answer:
                'Desde tu perfil. La cuenta queda deshabilitada y no se elimina, para conservar el historial de tus contrataciones.',
        },
    ];
}
