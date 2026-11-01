import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Brand } from '../../shared/components/brand/brand';
import { RouterLink } from '@angular/router';

interface FooterLink {
  label: string;
  to: string;
  fragment?: string;
}

@Component({
  selector: 'app-public-footer',
  imports: [RouterLink, Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      background: var(--c-text);
      color: var(--c-bg);
    }
    .inner {
      display: grid;
      grid-template-columns: 1.6fr 1fr 1fr 1fr;
      gap: 2.5rem;
      max-width: 1200px;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 2.5rem;
    }

    .blurb {
      max-width: 20rem;
      margin-top: 1rem;
      color: color-mix(in srgb, var(--c-bg) 75%, transparent);
    }
    h2 {
      margin-bottom: 1rem;
      color: var(--c-white);
      font-size: 1rem;
      font-weight: 600;
    }
    ul {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li a {
      color: color-mix(in srgb, var(--c-bg) 80%, transparent);
      text-decoration: none;
    }
    li a:hover {
      color: var(--c-white);
      text-decoration: underline;
    }

    .legal {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.25rem 1.5rem 2rem;
      border-top: 1px solid color-mix(in srgb, var(--c-bg) 15%, transparent);
      color: color-mix(in srgb, var(--c-bg) 60%, transparent);
      font-size: 0.875rem;
    }

    @media (max-width: 900px) {
      .inner {
        grid-template-columns: 1fr 1fr;
      }
      .brand-col {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 520px) {
      .inner {
        grid-template-columns: 1fr;
      }
    }
  `,

  template: `
    <div class="inner">
      <div class="brand-col">
          <app-brand size="lg" tone="light" />
        <p class="blurb">Conectamos clientes y prestadores de servicios locales con confianza.</p>
      </div>

      @for (col of columns; track col.title) {
        <nav [attr.aria-label]="col.title">
          <h2>{{ col.title }}</h2>
          <ul>
            @for (l of col.links; track l.label) {
              <li>
                <a [routerLink]="l.to" [fragment]="l.fragment">{{ l.label }}</a>
              </li>
            }
          </ul>
        </nav>
      }
    </div>

    <div class="legal">© {{ year }} Confiance. Todos los derechos reservados.</div>
  `,
})
export class PublicFooter {
  protected readonly year = new Date().getFullYear();

  protected readonly columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Plataforma',
      links: [
        { label: 'Buscar servicios', to: '/buscar' },
        { label: 'Publicar necesidad', to: '/cliente/necesidades' },
        { label: 'Para prestadores', to: '/prestadores' },
      ],
    },

    {
      title: 'Ayuda',
      links: [
        { label: 'Cómo funciona', to: '/como-funciona' },
        { label: 'Seguridad', to: '/seguridad' },
        { label: 'Iniciar sesión', to: '/auth/iniciar-sesion' },
      ],
    },

    {
      title: 'Legal',
      links: [
        { label: 'Términos y condiciones', to: '/terminos' },
        { label: 'Tratamiento de datos', to: '/privacidad' },
      ],
    },
  ];
}
