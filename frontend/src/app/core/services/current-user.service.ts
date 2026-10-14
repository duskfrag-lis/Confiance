import { Injectable, computed, signal } from '@angular/core';
import { CurrentUser } from '../models/current-user';

/**
 * Usuario de la sesión actual.
 * Temporal: usa un prestador de ejemplo. Cuando se conecte el login real,
 * load() debe llamar a GET /api/auth/me y guardar la respuesta en `user`.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly user = signal<CurrentUser | null>({
    id: '2',
    email: 'carlos.mendez@example.com',
    nombres: 'Carlos',
    apellidos: 'Méndez',
    emailVerificado: true,
    perfilActivo: 'provider',
    perfiles: { cliente: false, prestador: true },
    esAdmin: false,
    fotoUrl: null,
  });

  readonly current = this.user.asReadonly();

  /** Primer nombre, para saludos ("Buenos días, Carlos"). */
  readonly firstName = computed(() => this.user()?.nombres.split(' ')[0] ?? '');

  readonly fullName = computed(() => {
    const u = this.user();
    return u ? `${u.nombres} ${u.apellidos}` : '';
  });

  // TODO: POST /api/auth/logout y limpiar la sesión.
  logout(): void {
    this.user.set(null);
  }
}
