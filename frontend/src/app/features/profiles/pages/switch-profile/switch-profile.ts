import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { HOME_BY_PROFILE, CurrentUserService } from '../../../../core/services/current-user.service';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { TradePicker } from '../../../auth/components/trade-picker/trade-picker';
import { AuthService } from '../../../auth/services/auth.service';

const ERRORS: Record<string, string> = {
  TRADES_REQUIRED: 'Elige entre 1 y 3 oficios para activar tu perfil de prestador.',
  INVALID_CATEGORY: 'Alguno de los oficios ya no está disponible. Elige otro.',
  NIT_TAKEN: 'Este NIT ya está registrado por otro prestador.',
};

@Component({
  selector: 'app-switch-profile',
  imports: [FormsModule, Icon, FieldError, TradePicker],
  templateUrl: './switch-profile.html',
  styleUrl: './switch-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwitchProfile {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly user = inject(CurrentUserService);

  protected readonly target = computed(() => (this.user.current()?.perfilActivo === 'provider' ? 'client' : 'provider'));
  protected readonly targetLabel = computed(() => (this.target() === 'provider' ? 'prestador' : 'cliente'));
  protected readonly exists = computed(() => {
    const p = this.user.current()?.perfiles;
    return this.target() === 'provider' ? !!p?.prestador : !!p?.cliente;
  });

  protected readonly trades = signal<string[]>([]);
  protected readonly nit = signal('');
  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly tradesError = computed(() =>
    this.submitted() && this.target() === 'provider' && !this.exists() && !this.trades().length
      ? 'Elige al menos un oficio.'
      : null,
  );

  protected readonly nitError = computed(() => {
    const v = this.nit().replace(/\s/g, '');
    return v && !/^\d{9}-?\d$/.test(v) ? 'Ingresa un NIT válido (ej. 900123456-7).' : null;
  });

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.tradesError() || this.nitError() || this.loading()) return;

    const target = this.target();
    const extra =
      target === 'provider' && !this.exists() ? { oficios: this.trades(), nit: this.nit().trim() || null } : {};

    this.loading.set(true);
    this.auth
      .switchProfile(target, extra)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl(HOME_BY_PROFILE[target]),
        error: (err) =>
          this.serverError.set(ERRORS[apiErrorCode(err) ?? ''] ?? 'No pudimos cambiar tu perfil. Inténtalo de nuevo.'),
      });
  }
}
