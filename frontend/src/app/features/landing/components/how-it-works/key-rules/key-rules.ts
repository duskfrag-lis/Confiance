import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon, IconName } from '../../../../../shared/components/icon/icon';

@Component({
  selector: 'app-key-rules',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
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
      gap: 1rem;
      padding: 1.5rem;
      border: 1px solid var(--c-border);
      border-radius: 16px;
      background: var(--c-card);
      box-shadow: var(--shadow-card);
    }
    h3 {
      font-size: 1.1875rem;
      font-weight: 600;
    }
    p {
      margin-top: 0.4rem;
      color: var(--c-muted);
      line-height: 1.6;
    }
    @media (max-width: 960px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 640px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  template: `
    <section class="landing-section">
      <h2 class="section-title">Reglas que conviene conocer</h2>

      <div class="grid">
        @for (r of rules; track r.title) {
          <article class="card">
            <span class="icon-tile"><app-icon [name]="r.icon" [size]="30" /></span>
            <div>
              <h3>{{ r.title }}</h3>
              <p>{{ r.text }}</p>
            </div>
          </article>
        }
      </div>
    </section>
  `,
})

export class KeyRules {
  protected readonly rules: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'calendar-x',
      title: 'Cancelación',
      text: 'Puedes cancelar hasta 24 horas antes de la cita. Después, solo puedes solicitar reagendar, salvo por fuerza mayor.',
    },
    {
      icon: 'hourglass',
      title: 'Plazos de respuesta',
      text: 'El prestador tiene 48 horas para responder y el cliente 24 horas para confirmar. Si no, la solicitud se cancela sola.',
    },
    {
      icon: 'refresh',
      title: 'Reagendamiento',
      text: 'Hasta 2 solicitudes por contratación, con la aceptación de la otra parte.',
    },
    {
      icon: 'money',
      title: 'Pagos',
      text: 'Pagas al final, por PSE o por transferencia al prestador. Confiance nunca te pide datos de tarjeta.',
    },
    {
      icon: 'star',
      title: 'Calificaciones',
      text: 'Solo se pueden calificar contrataciones completadas, una vez por cada parte.',
    },
    {
      icon: 'flag',
      title: 'Reclamos',
      text: 'Si algo sale mal, creas un reclamo con fotos y el equipo lo revisa y deja la resolución registrada.',
    },
  ];
}
