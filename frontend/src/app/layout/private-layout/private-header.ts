import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrentUserService } from '../../core/services/current-user.service';
import { InboxService } from '../../core/services/inbox.service';
import { Avatar } from '../../shared/components/avatar/avatar';
import { Icon } from '../../shared/components/icon/icon';
import { SidebarState } from './sidebar-state';

@Component({
  selector: 'app-private-header',
  imports: [RouterLink, Icon, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 30;
      display: block;
      background: var(--c-surface-2);
      border-bottom: 1px solid var(--c-border);
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 560px) minmax(0, 1fr);
      align-items: center;
      gap: 1.5rem;
      height: 72px;
      padding: 0 1.25rem;
    }

    .start {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--c-text);
      font-size: 1.375rem;
      font-weight: 600;
      text-decoration: none;
    }
    .brand img {
      width: 46px;
      height: 46px;
      object-fit: contain;
    }

    .icon-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--c-text);
      cursor: pointer;
      transition: background-color var(--dur-fast);
    }
    .icon-btn:hover {
      background: var(--c-surface-3);
    }
    .icon-btn:focus-visible,
    .user-btn:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .menu-btn {
      display: none;
    }
    .count {
      position: absolute;
      top: 4px;
      right: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border: 2px solid var(--c-surface-2);
      border-radius: 999px;
      background: var(--c-error);
      color: var(--c-white);
      font-size: 0.6875rem;
      font-weight: 700;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      height: 46px;
      padding: 0 1rem;
      border: 1px solid var(--c-border);
      border-radius: 12px;
      background: var(--c-white);
      color: var(--c-muted);
      transition:
        border-color var(--dur-fast),
        box-shadow var(--dur-fast);
    }
    .search:focus-within {
      border-color: var(--c-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 20%, transparent);
    }
    .search input {
      flex: 1;
      min-width: 0;
      height: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--c-text);
      font: inherit;
    }

    .end {
      position: relative;
      display: flex;
      justify-self: end;
      align-items: center;
      gap: 0.5rem;
    }
    .user-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.25rem 0.5rem 0.25rem 0.25rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--c-text);
      font-weight: 600;
      cursor: pointer;
      transition: background-color var(--dur-fast);
    }
    .user-btn:hover {
      background: var(--c-surface-3);
    }
    .user-btn app-icon {
      transition: transform var(--dur) var(--ease-out);
    }
    .user-btn[aria-expanded='true'] app-icon {
      transform: rotate(180deg);
    }

    .menu {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      min-width: 280px;
      padding: 0.4rem;
      border: 1px solid var(--c-border);
      border-radius: 12px;
      background: var(--c-bg);
      box-shadow: 0 16px 32px color-mix(in srgb, var(--c-text) 14%, transparent);
      transform-origin: top right;
      animation: menu-in var(--dur-fast) var(--ease-out);
    }
    @keyframes menu-in {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
      }
    }
    .menu a,
    .menu button {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.7rem 0.85rem;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--c-text);
      font: inherit;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    .menu a:hover,
    .menu button:hover {
      background: var(--c-surface-2);
    }
    .menu hr {
      margin: 0.35rem 0;
      border: 0;
      border-top: 1px solid var(--c-border);
    }
    .menu__head {
      padding: 0.75rem 0.85rem 0.6rem;
    }
    .menu__name {
      font-size: 1.0625rem;
      font-weight: 600;
    }
    .menu__email {
      margin-top: 0.15rem;
      color: var(--c-muted);
      font-size: 0.875rem;
    }
    .menu__profile {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.75rem;
      padding: 0.3rem 0.75rem;
      border: 1px solid var(--c-border);
      border-radius: 999px;
      background: var(--c-surface-2);
      color: var(--c-muted);
      font-size: 0.875rem;
      font-weight: 600;
    }

    @media (max-width: 900px) {
      .menu-btn {
        display: inline-flex;
      }
      .bar {
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 0.75rem;
      }
      .brand span,
      .user-name {
        display: none;
      }
    }
    @media (max-width: 560px) {
      .bar {
        padding: 0 0.75rem;
      }
      .brand img {
        width: 38px;
        height: 38px;
      }
    }
  `,
  template: `
    <div class="bar">
      <div class="start">
        <button
          type="button"
          class="icon-btn menu-btn"
          aria-label="Abrir menú"
          (click)="sidebar.openMobile()"
        >
          <app-icon name="list" [size]="22" />
        </button>
        <a class="brand" [routerLink]="user.home()">
          <img src="images/logo.png" alt="" width="46" height="46" />
          <span>Confiance</span>
        </a>
      </div>

      <form class="search" role="search" (submit)="search($event, q.value)">
        <app-icon name="search" [size]="18" />
        <input #q type="search" [placeholder]="searchLabel()" [attr.aria-label]="searchLabel()" />
      </form>

      <div class="end">
        <a
          class="icon-btn"
          [routerLink]="user.home() + '/notificaciones'"
          [attr.aria-label]="'Notificaciones, ' + inbox.unreadNotifications() + ' sin leer'"
        >
          <app-icon name="bell" [size]="22" />
          @if (inbox.unreadNotifications()) {
            <span class="count" aria-hidden="true">{{ inbox.unreadNotifications() }}</span>
          }
        </a>

        <button
          type="button"
          class="user-btn"
          aria-haspopup="menu"
          [attr.aria-expanded]="menuOpen()"
          (click)="menuOpen.set(!menuOpen())"
        >
          <app-avatar [name]="user.fullName()" [photoUrl]="user.current()?.fotoUrl" [size]="40" />
          <span class="user-name">{{ user.fullName() }}</span>
          <app-icon name="caret-down" [size]="16" />
        </button>

        @if (menuOpen()) {
          <div class="menu" role="menu">
            <div class="menu__head">
              <p class="menu__name">{{ user.fullName() }}</p>
              <p class="menu__email">{{ user.current()?.email }}</p>
              <span class="menu__profile">
                <app-icon [name]="isProvider() ? 'briefcase' : 'user'" [size]="16" />
                Perfil activo: {{ isProvider() ? 'prestador' : 'cliente' }}
              </span>
            </div>
            <hr />
            
            <a role="menuitem" [routerLink]="user.home() + '/cambiar-perfil'" (click)="menuOpen.set(false)">
              <app-icon name="swap" [size]="18" />
              {{ switchLabel() }}
            </a>
            <a role="menuitem" [routerLink]="user.home() + '/configuracion'" (click)="menuOpen.set(false)">
              <app-icon name="gear" [size]="18" /> Configuración
            </a>
            <button type="button" role="menuitem" (click)="logout()">
              <app-icon name="sign-out" [size]="18" /> Cerrar sesión
            </button>
          </div>
        }
      </div>
    </div>
  `,
})

export class PrivateHeader {
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly sidebar = inject(SidebarState);
  protected readonly inbox = inject(InboxService);
  protected readonly user = inject(CurrentUserService);
  protected readonly menuOpen = signal(false);

  protected readonly isProvider = computed(() => this.user.current()?.perfilActivo === 'provider');
  protected readonly searchLabel = computed(() => (this.isProvider() ? 'Buscar necesidades' : 'Buscar servicios'));
  protected readonly switchLabel = computed(() => {
    const u = this.user.current();
    if (!u) return '';
    const other = this.isProvider() ? 'cliente' : 'prestador';
    const has = this.isProvider() ? u.perfiles.cliente : u.perfiles.prestador;
    return `${has ? 'Cambiar a' : 'Activar'} perfil ${other}`;
  });

  protected search(event: Event, q: string): void {
    event.preventDefault();
    const query = q.trim();
    const target = this.isProvider() ? '/prestador/necesidades' : '/cliente/buscar';
    this.router.navigate([target], { queryParams: query ? { q: query } : {} });
  }

  protected logout(): void {
    this.menuOpen.set(false);
    void this.user.logout();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }
}
