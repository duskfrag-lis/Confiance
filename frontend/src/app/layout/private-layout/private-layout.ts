import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { PrivateHeader } from './private-header';
import { PrivateSidebar } from './private-sidebar';
import { SidebarState } from './sidebar-state';

@Component({
  selector: 'app-private-layout',
  imports: [RouterOutlet, PrivateHeader, PrivateSidebar],
  providers: [SidebarState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'state.closeMobile()' },
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--c-bg);
    }
    .body {
      display: flex;
    }
    app-private-sidebar {
      position: sticky;
      top: 72px;
      height: calc(100vh - 72px);
    }
    main {
      flex: 1;
      min-width: 0;
    }

    .backdrop {
      display: none;
    }
    @media (max-width: 900px) {
      app-private-sidebar {
        height: 100vh;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 35;
        display: block;
        background: color-mix(in srgb, var(--c-text) 45%, transparent);
        animation: fade-in var(--dur) var(--ease-out);
      }
    }
  `,
  template: `
    <app-private-header />
    <div class="body">
      <app-private-sidebar />
      @if (state.mobileOpen()) {
        <div class="backdrop" (click)="state.closeMobile()"></div>
      }
      <main><router-outlet /></main>
    </div>
  `,
})

export class PrivateLayout {
  protected readonly state = inject(SidebarState);

  constructor() {

    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.state.closeMobile());
  }
}
