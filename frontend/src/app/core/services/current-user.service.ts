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

  readonly home = computed(() => HOME_BY_PROFILE[this.user()?.perfilActivo ?? 'client']);

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
      await this.router.navigate(['/auth/iniciar-sesion'], { queryParams: { sesion: 'cerrada' } });
    }
  }
}
