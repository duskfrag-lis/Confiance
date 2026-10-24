import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentUserService } from '../../core/services/current-user.service';
import { InboxService } from '../../core/services/inbox.service';
import { ChatService } from '../../features/chat/services/chat.service';
import { Icon } from '../../shared/components/icon/icon';
import { ADMIN_NAV, CLIENT_NAV, PROVIDER_NAV } from './nav-items';
import { SidebarState } from './sidebar-state';

@Component({
  selector: 'app-private-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapsed]': 'state.collapsed()',
    '[class.is-open]': 'state.mobileOpen()',
  },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 264px;
      height: 100%;
      padding: 1rem 0.75rem;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--c-surface-2);
      border-right: 1px solid var(--c-border);
      transition: width var(--dur) var(--ease-out);
    }
    :host(.is-collapsed) {
      width: 76px;
    }

    nav {
      flex: 1;
    }
    .section-title {
      margin: 1.25rem 0 0.4rem;
      padding: 0 0.85rem;
      color: var(--c-muted);
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      transition: opacity var(--dur-fast);
    }
    ul {
      display: grid;
      gap: 0.2rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .link {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.85rem;
      height: 46px;
      padding: 0 0.85rem;
      border-radius: var(--radius);
      color: var(--c-text);
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
      transition:
        background-color var(--dur-fast),
        color var(--dur-fast);
    }
    .link app-icon {
      color: var(--c-primary);
    }
    .link:hover {
      background: var(--c-surface-3);
    }
    .link:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 1px;
    }
    
    .link.is-active {
      background: var(--c-bg);
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--c-accent);
    }
    .link.is-active app-icon {
      color: var(--c-accent-dark);
    }

    .label {
      flex: 1;
      transition: opacity var(--dur-fast);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--c-error);
      color: var(--c-white);
      font-size: 0.75rem;
      font-weight: 700;
    }

    .collapse-btn {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      height: 44px;
      margin-top: 1rem;
      padding: 0 0.85rem;
      border: 0;
      border-radius: var(--radius);
      background: transparent;
      color: var(--c-muted);
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    .collapse-btn:hover {
      background: var(--c-surface-3);
      color: var(--c-text);
    }
    .collapse-btn app-icon {
      transition: transform var(--dur) var(--ease-out);
    }

    
    :host(.is-collapsed) .label,
    :host(.is-collapsed) .section-title {
      opacity: 0;
      pointer-events: none;
    }
    :host(.is-collapsed) .section-title {
      height: 0;
      margin: 0.75rem 0 0;
      border-top: 1px solid var(--c-border);
    }
    :host(.is-collapsed) .badge {
      position: absolute;
      top: 8px;
      left: 30px;
      min-width: 10px;
      width: 10px;
      height: 10px;
      padding: 0;
      font-size: 0;
    }
    :host(.is-collapsed) .collapse-btn app-icon {
      transform: rotate(180deg);
    }

    @media (max-width: 900px) {
      :host,
      :host(.is-collapsed) {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 40;
        width: 280px;
        box-shadow: 0 0 40px color-mix(in srgb, var(--c-text) 20%, transparent);
        transform: translateX(-100%);
        transition: transform var(--dur) var(--ease-out);
      }
      :host(.is-open) {
        transform: none;
      }
      :host(.is-collapsed) .label,
      :host(.is-collapsed) .section-title {
        opacity: 1;
      }
      :host(.is-collapsed) .section-title {
        height: auto;
        margin: 1.25rem 0 0.4rem;
        border-top: 0;
      }
      .collapse-btn {
        display: none;
      }
    }
  `,
  template: `
    <nav [attr.aria-label]="state.admin() ? 'Menú del administrador' : isProvider() ? 'Menú del prestador' : 'Menú del cliente'">
      @for (section of sections(); track $index) {
        @if (section.title) {
          <p class="section-title">{{ section.title }}</p>
        }
        <ul>
          @for (item of section.items; track item.path) {
            <li>
              <a
                class="link"
                [routerLink]="item.path"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: !!item.exact }"
                [attr.title]="state.collapsed() ? item.label : null"
                (click)="state.closeMobile()"
              >
                <app-icon [name]="item.icon" [size]="22" />
                <span class="label">{{ item.label }}</span>
                @if (item.badge === 'messages' && inbox.unreadMessages()) {
                  <span class="badge" [attr.aria-label]="inbox.unreadMessages() + ' sin leer'">
                    {{ inbox.unreadMessages() }}
                  </span>
                }
              </a>
            </li>
          }
        </ul>
      }
    </nav>

    <button
      type="button"
      class="collapse-btn"
      [attr.aria-expanded]="!state.collapsed()"
      [attr.title]="state.collapsed() ? 'Expandir menú' : null"
      (click)="state.toggleCollapsed()"
    >
      <app-icon name="caret-left" [size]="20" />
      <span class="label">Contraer menú</span>
    </button>
  `,
})

export class PrivateSidebar {
  protected readonly state = inject(SidebarState);
  protected readonly inbox = inject(InboxService);
  private readonly user = inject(CurrentUserService);
  protected readonly isProvider = computed(() => this.user.current()?.perfilActivo === 'provider');
  protected readonly sections = computed(() => (this.state.admin() ? ADMIN_NAV : this.isProvider() ? PROVIDER_NAV : CLIENT_NAV));

  constructor() {
    inject(ChatService).refresh();
  }
}
