import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { PASSWORD_RULES, matchesField, passwordRules } from '../../forms/auth-forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthShell, FieldError, Icon],
  templateUrl: './reset-password.html',
  styles: `
    .rules {
      display: grid;
      gap: 0.3rem;
      margin: 0.6rem 0 0;
      padding: 0;
      list-style: none;
      color: var(--c-muted);
      font-size: 0.9375rem;

      li {
        display: flex;
        align-items: center;
        gap: 0.45rem;
      }
      .is-met {
        color: var(--c-success);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  protected readonly heroItems = [
    'El enlace vence a los 30 minutos',
    'Solo puede usarse una vez',
    'Al cambiarla se cierran tus sesiones abiertas',
  ];

  protected readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, passwordRules] }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required, matchesField('password')] }),
  });

  private readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });

  protected readonly rules = computed(() =>
    PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(this.password()) })),
  );

  protected readonly invalidLink = signal(!this.token);
  protected readonly show = signal(false);
  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly done = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    this.form.controls.password.valueChanges.subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  protected passwordError(): string | null {
    const c = this.form.controls.password;
    if (c.valid || !(c.touched || this.submitted())) return null;
    return c.hasError('required') ? 'Escribe tu nueva contraseña.' : 'La contraseña no cumple todas las reglas.';
  }

  protected confirmError(): string | null {
    const c = this.form.controls.confirm;
    if (c.valid || !(c.touched || this.submitted())) return null;
    return c.hasError('required') ? 'Confirma tu nueva contraseña.' : 'Las contraseñas no coinciden.';
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.form.invalid || this.loading() || !this.token) return;

    this.loading.set(true);
    this.auth
      .resetPassword(this.token, this.form.controls.password.value)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.done.set(true),
        error: (err) =>
          apiErrorCode(err) === 'INVALID_TOKEN'
            ? this.invalidLink.set(true)
            : this.serverError.set('No pudimos cambiar tu contraseña. Inténtalo de nuevo en unos minutos.'),
      });
  }
}
