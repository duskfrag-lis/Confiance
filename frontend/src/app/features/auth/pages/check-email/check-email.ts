import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, interval, take } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { emailFormat, notBlank } from '../../forms/auth-forms';
import { AuthService } from '../../services/auth.service';
import { PendingVerification } from '../../services/pending-verification';

const COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-check-email',
  imports: [RouterLink, Icon, ReactiveFormsModule],
  templateUrl: './check-email.html',
  styleUrl: './check-email.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckEmail {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** Correo del registro recién hecho; se pierde si se abre en otra pestaña o navegador */
  protected readonly stored = inject(PendingVerification).email;
  protected readonly typed = new FormControl('', { nonNullable: true, validators: [notBlank, emailFormat] });
  private readonly typedValue = toSignal(this.typed.valueChanges, { initialValue: '' });
  // La validez se lee de statusChanges: al emitir valueChanges el estado aún no está actualizado
  private readonly typedStatus = toSignal(this.typed.statusChanges, { initialValue: this.typed.status });
  protected readonly email = computed(() =>
    this.stored() ?? (this.typedStatus() === 'VALID' ? this.typedValue().trim().toLowerCase() : null),
  );

  protected readonly sending = signal(false);
  protected readonly cooldown = signal(0);
  protected readonly feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  protected readonly canResend = computed(
    () => !!this.email() && !this.sending() && this.cooldown() === 0,
  );
  protected readonly label = computed(() => {
    if (this.sending()) return 'Reenviando…';
    return this.cooldown() > 0 ? `Reenviar correo (${this.cooldown()} s)` : 'Reenviar correo';
  });

  protected resend(): void {
    const email = this.email();
    if (!email || !this.canResend()) return;

    this.sending.set(true);
    this.feedback.set(null);
    this.auth
      .resendVerification(email)
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set({
            type: 'success',
            text: 'Te enviamos un nuevo enlace de verificación.',
          });
          this.startCooldown();
        },
        error: () =>
          this.feedback.set({
            type: 'error',
            text: 'No pudimos reenviar el correo. Inténtalo de nuevo en unos minutos.',
          }),
      });
  }

  private startCooldown(): void {
    this.cooldown.set(COOLDOWN_SECONDS);
    interval(1000)
      .pipe(take(COOLDOWN_SECONDS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cooldown.update((s) => s - 1));
  }
}
