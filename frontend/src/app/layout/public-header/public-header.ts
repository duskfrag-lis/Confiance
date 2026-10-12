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
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 1.5rem;
      max-width: 1200px;
      height: 76px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    .brand {
      justify-self: start;
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      color: var(--c-text);
      font-size: 1.5rem;
      font-weight: 600;
      text-decoration: none;
    }

    .brand img {
      width: 52px;
      height: 52px;
      object-fit: contain;
    }

    .nav {
      display: flex;
      gap: 2rem;
    }

    .nav a {
      color: var(--c-text);
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }

    .nav a:hover {
      color: var(--c-primary);
    }

    .actions {
      justify-self: end;
      display: flex;
      gap: 0.6rem;
    }

    .btn--sm {
      height: 42px;
      padding: 0 1.1rem;
      font-size: 0.9375rem;
      white-space: nowrap;
    }

    @media (max-width: 1024px) {

      .nav {
        gap: 1.25rem;
      }
    }

    @media (max-width: 900px) {

      .bar {
        grid-template-columns: 1fr auto;
      }

      .nav {
        display: none;
      }
    }

    @media (max-width: 560px) {

      .bar {
        height: 64px;
        padding: 0 1rem;
      }

      .brand img {
        width: 44px;
        height: 44px;
      }

      .brand span {
        display: none;
      }
    }
  `,

  template: `
    <div class="bar">
      <a class="brand" routerLink="/">
        <img src="images/logo.png" alt="" width="52" height="52" />
        <span>Confiance</span>
      </a>

      <nav class="nav" aria-label="Principal">
        <a routerLink="/" fragment="como-funciona">Cómo funciona</a>
        <a routerLink="/" fragment="oficios">Oficios</a>
        <a routerLink="/" fragment="seguridad">Seguridad</a>
        <a routerLink="/" fragment="prestadores">Para prestadores</a>

      </nav>

      <div class="actions">
        <a class="btn btn--outline btn--sm" routerLink="/auth/iniciar-sesion">Iniciar sesión</a>
        <a class="btn btn--primary btn--sm" routerLink="/auth/registro">Crear cuenta</a>
      </div>
    </div>
  `,
})
export class PublicHeader {}
