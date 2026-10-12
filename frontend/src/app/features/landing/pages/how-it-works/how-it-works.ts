import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClientSteps } from '../../components/how-it-works/client-steps/client-steps';
import { ProviderSteps } from '../../components/how-it-works/provider-steps/provider-steps';
import { ContractJourney } from '../../components/how-it-works/contract-journey/contract-journey';
import { KeyRules } from '../../components/how-it-works/key-rules/key-rules';

type Audience = 'cliente' | 'prestador';

/**
 * Página "Cómo funciona" con dos vistas: cliente y prestador.
 * Se abre en la vista de prestador cuando llega con #prestadores (desde la landing).
 */
@Component({
  selector: 'app-how-it-works',
  imports: [RouterLink, ClientSteps, ProviderSteps, ContractJourney, KeyRules],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    .intro {
      background: var(--c-surface-2);
      border-bottom: 1px solid var(--c-border);
    }
    .intro .landing-section {
      padding: 2.25rem 1.5rem 2rem;
    }
    h1 {
      font-size: clamp(1.875rem, 3.4vw, 2.625rem);
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .intro .section-sub {
      margin-top: 0.5rem;
    }
    .tabs {
      display: inline-flex;
      gap: 0.5rem;
      margin-top: 1.25rem;
    }
    .tab {
      height: 40px;
      padding: 0 1.25rem;
      border: 1px solid var(--c-border);
      border-radius: 999px;
      background: var(--c-white);
      color: var(--c-text);
      font-weight: 600;
      cursor: pointer;
    }
    .tab:hover {
      border-color: var(--c-primary);
    }
    .tab:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .tab[aria-pressed='true'] {
      border-color: var(--c-primary);
      background: var(--c-primary);
      color: var(--c-white);
    }

    .cta {
      background: var(--c-surface-3);
      border-top: 1px solid var(--c-border);
    }
    .cta .btn {
      margin-top: 2rem;
    }

    @media (max-width: 768px) {
      .intro .landing-section {
        padding: 1.75rem 1.25rem 1.5rem;
      }
    }
  `,
  template: `
    <div class="intro">
      <section class="landing-section">
        <h1>Cómo funciona Confiance</h1>
        <p class="section-sub">Paso a paso, desde tu registro hasta la calificación del servicio.</p>

        <div class="tabs" role="group" aria-label="Ver el paso a paso como">
          <button
            type="button"
            class="tab"
            [attr.aria-pressed]="audience() === 'cliente'"
            (click)="audience.set('cliente')"
          >
            Soy cliente
          </button>
          <button
            type="button"
            class="tab"
            [attr.aria-pressed]="audience() === 'prestador'"
            (click)="audience.set('prestador')"
          >
            Soy prestador
          </button>
        </div>
      </section>
    </div>

    @if (audience() === 'cliente') {
      <app-client-steps />
    } @else {
      <app-provider-steps />
    }

    <app-contract-journey />
    <app-key-rules />

    <div class="cta">
      <section class="landing-section">
        <h2 class="section-title">Listo para empezar</h2>
        @if (audience() === 'cliente') {
          <p class="section-sub">Crea tu cuenta y encuentra a quien necesitas.</p>
          <a class="btn btn--accent" routerLink="/auth/registro">Quiero contratar</a>
        } @else {
          <p class="section-sub">Crea tu perfil y empieza a recibir solicitudes.</p>
          <a class="btn btn--accent" routerLink="/auth/registro-prestador">Crear perfil de prestador</a>
        }
      </section>
    </div>
  `,
})
export class HowItWorks {
  protected readonly audience = signal<Audience>(
    inject(ActivatedRoute).snapshot.fragment === 'prestadores' ? 'prestador' : 'cliente',
  );
}
