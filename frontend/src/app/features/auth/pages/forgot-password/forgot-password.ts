import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { emailFormat, notBlank } from '../../forms/auth-forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthShell, FieldError, Icon],
  templateUrl: './forgot-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);

  protected readonly heroItems = [
    'Te enviamos un enlace a tu correo',
    'El enlace vence a los 30 minutos',
    'Solo puede usarse una vez',
  ];

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [notBlank, emailFormat] }),
  });

  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected emailError(): string | null {
    const c = this.form.controls.email;
    if (c.valid || !(c.touched || this.submitted())) return null;
    return c.hasError('required')
      ? 'Ingresa tu correo electrónico.'
      : 'Ingresa un correo electrónico válido.';
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);

    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.auth
      .requestPasswordReset(this.form.controls.email.value.trim().toLowerCase())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.sent.set(true),
        error: () => {
          this.sent.set(false);
          this.serverError.set('No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.');
        },
      });
  }
}
