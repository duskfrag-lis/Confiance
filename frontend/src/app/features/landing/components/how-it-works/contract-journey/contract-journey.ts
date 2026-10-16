import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon, IconName } from '../../../../../shared/components/icon/icon';

@Component({
  selector: 'app-contract-journey',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      background: var(--c-surface-2);
      border-top: 1px solid var(--c-border);
      border-bottom: 1px solid var(--c-border);
    }
    ol {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 1rem;
      margin: 3rem 0 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      border-radius: 12px;
      color: var(--c-primary);
    }
    .icon--final {
      background: var(--c-accent);
      color: var(--c-text);
    }
    strong {
      margin-top: 0.85rem;
      font-size: 1.125rem;
      font-weight: 600;
    }
    span.text {
      margin-top: 0.3rem;
      color: var(--c-muted);
      font-size: 0.9375rem;
    }
    @media (max-width: 1024px) {
      ol {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        row-gap: 2rem;
      }
    }
    @media (max-width: 520px) {
      ol {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  template: `
    <section class="landing-section">
      <h2 class="section-title">El recorrido de una contratación</h2>
      <p class="section-sub">Así avanza cada servicio, para clientes y prestadores.</p>

      <ol>
        @for (s of stages; track s.title; let last = $last) {
          <li>
            <span class="icon" [class.icon--final]="last"><app-icon [name]="s.icon" [size]="26" /></span>
            <strong>{{ s.title }}</strong>
            <span class="text">{{ s.text }}</span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class ContractJourney {
  protected readonly stages: { icon: IconName; title: string; text: string }[] = [
    { icon: 'send', title: 'Solicitada', text: 'El cliente envía la solicitud' },
    { icon: 'check', title: 'Aceptada', text: 'El horario queda reservado' },
    { icon: 'calendar-check', title: 'Confirmada', text: 'Se genera la cita' },
    { icon: 'play', title: 'En curso', text: 'El prestador inicia el servicio' },
    { icon: 'flag', title: 'Finalizada', text: 'El cliente paga y confirma' },
    { icon: 'circle-check', title: 'Completada', text: 'Ambos pueden calificar' },
  ];
}
