import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, interval, take } from 'rxjs';
import { CurrentUserService } from '../../core/services/current-user.service';
import { AuthService } from '../../features/auth/services/auth.service';
import { Icon } from '../../shared/components/icon/icon';

const COOLDOWN_SECONDS = 60;

/**
 * HU-05.4: quien entró sin verificar el correo siempre tiene a mano el reenvío del enlace.
 * Sin verificar no se pueden registrar datos bancarios ni documentos (D-57).
 */
@Component({
  selector: 'app-verify-email-notice',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .notice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1rem;
      margin: 1rem 1rem 0;
      padding: 0.85rem 1rem;
      border: 1px solid color-mix(in srgb, var(--c-warning) 55%, transparent);
      border-radius: var(--radius);
      background: var(--c-warning-bg);
      color: var(--c-warning-dark);
      font-size: 0.9375rem;
    }
    .notice__text {
      display: flex;
      flex: 1 1 18rem;
      gap: 0.6rem;
      align-items: flex-start;
    }
    .notice__ok {
      color: var(--c-success);
    }
  `,
  template: `
    @if (pending()) {
      <div class="notice" role="status">
        <p class="notice__text">
          <app-icon name="mail" [size]="20" />
          @if (sent()) {
            <span class="notice__ok">Te enviamos un enlace nuevo a {{ email() }}. Revisa también la carpeta de spam.</span>
          } @else if (failed()) {
            <span>No pudimos reenviar el correo. Inténtalo de nuevo en unos minutos.</span>
          } @else {
            <span>Verifica tu correo para usar todas las funciones de Confiance.</span>
          }
        </p>
        <button class="btn btn--ghost btn--sm" type="button" (click)="resend()" [disabled]="!canResend()">
          {{ label() }}
        </button>
      </div>
    }
  `,
})
export class VerifyEmailNotice {
  private readonly auth = inject(AuthService);
  private readonly user = inject(CurrentUserService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pending = computed(() => this.user.current()?.emailVerificado === false);
  protected readonly email = computed(() => this.user.current()?.email ?? '');
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly failed = signal(false);
  protected readonly cooldown = signal(0);

  protected readonly canResend = computed(() => !this.sending() && this.cooldown() === 0);
  protected readonly label = computed(() => {
    if (this.sending()) return 'Enviando…';
    return this.cooldown() > 0 ? `Reenviar enlace (${this.cooldown()} s)` : 'Reenviar enlace';
  });

  protected resend(): void {
    if (!this.canResend()) return;

    this.sending.set(true);
    this.failed.set(false);
    this.auth
      .resendMyVerification()
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: () => {
          this.sent.set(true);
          this.startCooldown();
        },
        error: () => this.failed.set(true),
      });
  }

  private startCooldown(): void {
    this.cooldown.set(COOLDOWN_SECONDS);
    interval(1000)
      .pipe(take(COOLDOWN_SECONDS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cooldown.update((s) => s - 1));
  }
}
