import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Brand } from '../../shared/components/brand/brand';
import { Icon } from '../../shared/components/icon/icon';

@Component({
  selector: 'app-public-header',
  imports: [RouterLink, RouterLinkActive, Brand, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
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
    }

    .nav {
      display: flex;
      gap: 2rem;
    }

    .nav a {
      padding: 0.35rem 0;
      border-bottom: 2px solid transparent;
      color: var(--c-text);
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }

    .nav a:hover {
      color: var(--c-primary);
    }

    .nav a.is-active {
      border-bottom-color: var(--c-accent);
      font-weight: 600;
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

    .menu-btn,
    .menu {
      display: none;
    }
    .menu-btn {
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--c-border);
      border-radius: 12px;
      background: var(--c-white);
      color: var(--c-text);
      cursor: pointer;
    }
    .menu-btn:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .menu {
      position: absolute;
      top: 100%;
      right: 0;
      left: 0;
      padding: 0.5rem 1rem 1rem;
      border-bottom: 1px solid var(--c-border);
      background: var(--c-surface-2);
      box-shadow: 0 16px 32px color-mix(in srgb, var(--c-text) 12%, transparent);
      animation: menu-in var(--dur-fast) var(--ease-out);
    }
    @keyframes menu-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
    .menu a:not(.btn) {
      display: flex;
      align-items: center;
      min-height: 52px;
      padding: 0 0.5rem;
      border-bottom: 1px solid var(--c-border);
      color: var(--c-text);
      font-size: 1.0625rem;
      font-weight: 500;
      text-decoration: none;
    }
    .menu a.is-active {
      color: var(--c-primary-dark);
      font-weight: 700;
    }
    .menu__actions {
      display: none;
      gap: 0.6rem;
      margin-top: 1rem;
    }
    .menu__actions .btn {
      flex: 1;
      height: 48px;
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
      .menu-btn {
        display: inline-flex;
      }
      .menu.is-open {
        display: block;
      }
    }

    @media (max-width: 560px) {

      .bar {
        height: 64px;
        padding: 0 1rem;
      }

      .brand {
        --brand-word: none;
      }
      .actions .login {
        display: none;
      }
      .menu__actions {
        display: flex;
      }
    }
  `,

  template: `
    <div class="bar">
      <app-brand class="brand" size="lg" />

      <nav class="nav" aria-label="Principal">
        <a routerLink="/como-funciona" routerLinkActive="is-active">Cómo funciona</a>
        <a routerLink="/oficios" routerLinkActive="is-active">Oficios</a>
        <a routerLink="/seguridad" routerLinkActive="is-active">Seguridad</a>
        <a routerLink="/prestadores" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">Para prestadores</a>

      </nav>

      <div class="actions">
        @if (user.loggedIn()) {
          <a class="btn btn--primary btn--sm" [routerLink]="user.home()">Ir a mi panel</a>
        } @else {
          <a class="btn btn--outline btn--sm login" routerLink="/auth/iniciar-sesion">Iniciar sesión</a>
          <a class="btn btn--primary btn--sm" routerLink="/auth/registro">Crear cuenta</a>
        }
        <button
          type="button"
          class="menu-btn"
          aria-controls="public-menu"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-label]="menuOpen() ? 'Cerrar menú' : 'Abrir menú'"
          (click)="menuOpen.set(!menuOpen())"
        >
          <app-icon [name]="menuOpen() ? 'x' : 'list'" [size]="22" />
        </button>
      </div>
    </div>

    <nav id="public-menu" class="menu" [class.is-open]="menuOpen()" aria-label="Menú">
      <a routerLink="/como-funciona" routerLinkActive="is-active">Cómo funciona</a>
      <a routerLink="/oficios" routerLinkActive="is-active">Oficios</a>
      <a routerLink="/seguridad" routerLinkActive="is-active">Seguridad</a>
      <a routerLink="/prestadores" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">Para prestadores</a>
      @if (!user.loggedIn()) {
        <div class="menu__actions">
          <a class="btn btn--outline" routerLink="/auth/iniciar-sesion">Iniciar sesión</a>
        </div>
      }
    </nav>
  `,
})
export class PublicHeader {
  protected readonly user = inject(CurrentUserService);
  protected readonly menuOpen = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }
}
