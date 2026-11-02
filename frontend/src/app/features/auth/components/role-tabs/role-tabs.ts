import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-role-tabs',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25rem;
      margin-top: 1.25rem;
      padding: 0.3rem;
      background: var(--c-surface-3);
      border-radius: 14px;
    }

    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.8rem 1rem;
      border-radius: 11px;
      color: var(--c-muted);
      font-weight: 600;
      text-decoration: none;
      transition:
        background-color 0.15s,
        color 0.15s;
    }

    .tab:hover {
      color: var(--c-text);
    }
    .tab.is-active {
      background: #fff;
      color: var(--c-text);
      box-shadow: 0 1px 3px rgba(44, 44, 44, 0.12);
    }
    .tab:focus-visible {
      outline: 3px solid rgba(74, 102, 120, 0.35);
      outline-offset: 2px;
    }
  `,

  template: `
    <nav class="tabs" aria-label="Tipo de cuenta">
      <a
        class="tab"
        routerLink="/auth/registro"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <app-icon name="user" [size]="18" /> Soy cliente
      </a>
      <a
        class="tab"
        routerLink="/auth/registro-prestador"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <app-icon name="briefcase" [size]="18" /> Soy prestador
      </a>
    </nav>
  `,
})
export class RoleTabs {}
