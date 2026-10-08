import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, timer } from 'rxjs';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AccountFields } from '../../components/account-fields/account-fields';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { RoleTabs } from '../../components/role-tabs/role-tabs';
import { applyRegisterError, buildAccountGroup, toBasePayload } from '../../forms/auth-forms';
import { AuthService } from '../../services/auth.service';
import { PendingVerification } from '../../services/pending-verification';
import { Recaptcha } from '../../../../shared/components/recaptcha/recaptcha';

@Component({
  selector: 'app-register-client',
  imports: [ReactiveFormsModule, RouterLink, AuthShell, RoleTabs, AccountFields, FieldError, Icon, Recaptcha],
  templateUrl: './register-client.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterClient {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingVerification);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recaptcha = viewChild(Recaptcha);

  protected readonly heroItems = [
    'Compara perfiles, calificaciones y trabajos aprobados',
    'Agenda solo en horarios realmente disponibles',
    'Coordina todo por el chat de Confiance',
  ];

  protected readonly account = buildAccountGroup();
  protected readonly terms = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });

  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly captcha = signal<string | null>(null);

  protected termsError(): string | null {
    return this.terms.invalid && (this.terms.touched || this.submitted())
      ? 'Debes aceptar los términos para crear tu cuenta.'
      : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    this.terms.markAsTouched();

    if (this.account.invalid || this.terms.invalid ||!this.captcha()  || this.loading()) return;

    this.loading.set(true);
    this.auth

    .registerClient({
      ...toBasePayload(this.account.getRawValue()),
      captchaToken: this.captcha()!,
    })

    .pipe(
      finalize(() => {
        this.loading.set(false);
        this.recaptcha()?.reset();
      }),
    )

    .subscribe({
      next: ({ email }) => {
        this.pending.set(email);
        this.success.set(true);
        timer(1600)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.router.navigate(['/auth/revisar-correo']));
      },

      error: (err) => this.serverError.set(applyRegisterError(err, this.account).message),
      
    });
  }
}
