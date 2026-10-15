import { Injectable, effect, signal } from '@angular/core';

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
