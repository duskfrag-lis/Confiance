import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LegalDocument, PRIVACY, TERMS } from './legal-content';

@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    article {
      max-width: 780px;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 5rem;
    }
    h1 {
      font-size: clamp(1.875rem, 3.4vw, 2.5rem);
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .updated {
      margin-top: 0.4rem;
      color: var(--c-muted);
    }
    .intro {
      margin-top: 1.25rem;
      font-size: 1.125rem;
    }
    section {
      margin-top: 2rem;
    }
    h2 {
      font-size: 1.25rem;
      font-weight: 600;
    }
    section p {
      margin-top: 0.6rem;
      color: var(--c-text-soft);
      line-height: 1.65;
    }
    .other {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--c-border);
      color: var(--c-muted);
      a {
        color: var(--c-primary-dark);
        font-weight: 600;
      }
    }
  `,
  template: `
    <article class="reveal">
      <h1>{{ doc.title }}</h1>
      <p class="updated">Última actualización: {{ doc.updated }}</p>
      <p class="intro">{{ doc.intro }}</p>

      @for (s of doc.sections; track s.title) {
        <section>
          <h2>{{ s.title }}</h2>
          @for (p of s.paragraphs; track $index) {
            <p>{{ p }}</p>
          }
        </section>
      }

      <p class="other">
        @if (isTerms) {
          Consulta también la <a routerLink="/privacidad">política de tratamiento de datos</a>.
        } @else {
          Consulta también los <a routerLink="/terminos">términos y condiciones</a>.
        }
      </p>
    </article>
  `,
})
export class Legal {
  protected readonly isTerms = inject(ActivatedRoute).snapshot.data['doc'] === 'terms';
  protected readonly doc: LegalDocument = this.isTerms ? TERMS : PRIVACY;
}
