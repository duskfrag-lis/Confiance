import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, unwrap } from '../api/api';
import { CurrentUser, ProfileName } from '../models/current-user';

export const HOME_BY_PROFILE: Record<ProfileName, string> = {
  client: '/cliente',
  provider: '/prestador',
};

/** Inicio de la cuenta. La de administrador es exclusiva y siempre va a su panel (decidido el 2026-10-31). */
export const homeFor = (user: CurrentUser | null): string =>
  user?.esAdmin ? '/admin' : HOME_BY_PROFILE[user?.perfilActivo ?? 'client'];

/** Al cerrar sesión, los datos de los simuladores (mockApi) no deben quedar para la siguiente cuenta del navegador. */
function clearMockData(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('confiance.mock.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Sin acceso al almacenamiento no hay nada que borrar
  }
}

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly user = signal<CurrentUser | null>(null);

  readonly current = this.user.asReadonly();
  readonly loggedIn = computed(() => this.user() !== null);

  readonly firstName = computed(() => this.user()?.nombres.split(' ')[0] ?? '');

  readonly fullName = computed(() => {
    const u = this.user();
    return u ? `${u.nombres} ${u.apellidos}` : '';
  });

  readonly home = computed(() => homeFor(this.user()));

  async load(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.http.get<ApiResponse<CurrentUser>>(`${environment.apiUrl}/auth/me`).pipe(unwrap())));
    } catch {
      this.user.set(null);
    }
  }

  set(user: CurrentUser): void {
    this.user.set(user);
  }

  clear(): void {
    this.user.set(null);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/auth/logout`, {}));
    } finally {
      this.clear();
      clearMockData();
      await this.router.navigate(['/auth/iniciar-sesion'], { queryParams: { sesion: 'cerrada' } });
    }
  }
}
