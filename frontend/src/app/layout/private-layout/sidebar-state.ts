import { Injectable, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

const STORAGE_KEY = 'confiance.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

@Injectable()
export class SidebarState {
  readonly collapsed = signal(readCollapsed());
  readonly mobileOpen = signal(false);

  private readonly router = inject(Router);
  /** El panel del administrador usa el mismo layout con su propio menú. */
  readonly admin = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin')),
    ),
    { initialValue: this.router.url.startsWith('/admin') },
  );

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.collapsed() ? '1' : '0');
      } catch {
        
      }
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  openMobile(): void {
    this.mobileOpen.set(true);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
