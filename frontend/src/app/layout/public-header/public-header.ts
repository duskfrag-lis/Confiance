import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 20;
      display: block;
      background: var(--c-surface-2);
      border-bottom: 1px solid var(--c-border);
    }

    .bar {
      display: flex;
      align-items: center;
      max-width: 1200px;
      height: 73px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--c-text);
      font-size: 1.5rem;
      font-weight: 600;
      text-decoration: none;
    }

    .brand img {
      width: 46px;
      height: 46px;
      object-fit: contain;
    }
    .nav {
      display: flex;
      gap: 1.75rem;
      margin-left: 2.5rem;
    }
    .nav a {
      color: var(--c-text);
      font-weight: 500;
      text-decoration: none;
    }
    .nav a:hover {
      color: var(--c-primary);
    }
    .actions {
      display: flex;
      gap: 0.6rem;
      margin-left: auto;
    }
    .btn--sm {
      height: 42px;
      padding: 0 1.1rem;
      font-size: 0.9375rem;
    }

    @media (max-width: 900px) {
      .nav {
        display: none;
      }
    }
    @media (max-width: 560px) {
      .brand span {
        display: none;
      }
    }
  `,

  template: `
    <div class="bar">
      <a class="brand" routerLink="/">
        <img src="images/logo.png" alt="" width="46" height="46" />
        <span>Confiance</span>
      </a>

      <nav class="nav" aria-label="Principal">
        <a routerLink="/" fragment="como-funciona">Cómo funciona</a>
        <a routerLink="/" fragment="oficios">Oficios</a>
        <a routerLink="/" fragment="seguridad">Seguridad</a>
        <a routerLink="/auth/registro-prestador">Para prestadores</a>
      </nav>

      <div class="actions">
        <a class="btn btn--outline btn--sm" routerLink="/auth/iniciar-sesion">Iniciar sesión</a>
        <a class="btn btn--primary btn--sm" routerLink="/auth/registro">Crear cuenta</a>
      </div>
    </div>
  `,
})
export class PublicHeader {}
