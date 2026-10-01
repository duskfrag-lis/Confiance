import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface FooterLink {
  label: string;
  to: string;
  fragment?: string;
}

@Component({
  selector: 'app-public-footer',
  imports: [RouterLink],
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

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      color: #fff;
      font-size: 1.5rem;
      font-weight: 600;
      text-decoration: none;
    }

    .brand img {
      width: 52px;
      height: 52px;
      padding: 4px;
      border-radius: 12px;
      background: #fff;
      object-fit: contain;
    }

    .blurb {
      max-width: 20rem;
      margin-top: 1rem;
      color: rgba(245, 242, 237, 0.75);
    }
    h2 {
      margin-bottom: 1rem;
      color: #fff;
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
      color: rgba(245, 242, 237, 0.8);
      text-decoration: none;
    }
    li a:hover {
      color: #fff;
      text-decoration: underline;
    }

    .legal {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.25rem 1.5rem 2rem;
      border-top: 1px solid rgba(245, 242, 237, 0.15);
      color: rgba(245, 242, 237, 0.6);
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
        <a class="brand" routerLink="/">
          <img src="images/logo.png" alt="" width="52" height="52" />
          <span>Confiance</span>
        </a>
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
        { label: 'Publicar necesidad', to: '/publicar' },
        { label: 'Para prestadores', to: '/auth/registro-prestador' },
      ],
    },

    {
      title: 'Ayuda',
      links: [
        { label: 'Cómo funciona', to: '/', fragment: 'como-funciona' },
        { label: 'Seguridad', to: '/', fragment: 'seguridad' },
        { label: 'Iniciar sesión', to: '/auth/iniciar-sesion' },
      ],
    },

    {
      title: 'Legal',
      links: [
        { label: 'Términos y condiciones', to: '/terminos' },
        { label: 'Privacidad', to: '/privacidad' },
        { label: 'Datos personales', to: '/datos-personales' },
      ],
    },
  ];
}
