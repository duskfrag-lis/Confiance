import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { emailFormat, notBlank } from '../../forms/auth-forms';
import { LoginError } from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';
import { Recaptcha } from '../../../../shared/components/recaptcha/recaptcha';
import { SocialButtons } from '../../components/social-buttons/social-buttons';

const SOCIAL_ERRORS: Record<string, string> = {
  'cuenta-con-contrasena':
    'Este correo ya está registrado con contraseña. Inicia sesión con tu correo y contraseña.',
  'cuenta-deshabilitada': 'Tu cuenta está deshabilitada. Contacta a soporte para reactivarla.',
  social: 'No pudimos iniciar sesión con ese proveedor. Inténtalo de nuevo.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthShell, FieldError, Icon, Recaptcha, SocialButtons],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly recaptcha = viewChild(Recaptcha);

  protected readonly heroItems = [
    'Identidad verificada',
    'Calificaciones de servicios reales',
    'Chat asociado a cada contratación',
  ];

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [notBlank, emailFormat] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly showPassword = signal(false);
  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly serverError = signal<string | null>(
    SOCIAL_ERRORS[this.route.snapshot.queryParamMap.get('error') ?? ''] ?? null,
  );
  protected readonly captcha = signal<string | null>(null);
  protected readonly loggedOut = signal(
    this.route.snapshot.queryParamMap.get('sesion') === 'cerrada',
  );

  protected emailError(): string | null {
    const c = this.form.controls.email;
    if (c.valid || !(c.touched || this.submitted())) return null;

    return c.hasError('required')
      ? 'Ingresa tu correo electrónico.'
      : 'Ingresa un correo electrónico válido.';
  }

  protected passwordError(): string | null {
    const c = this.form.controls.password;
    return c.invalid && (c.touched || this.submitted()) ? 'Ingresa tu contraseña.' : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    this.loggedOut.set(false);
    if (this.form.invalid || !this.captcha() || this.loading()) return;

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.auth
      .login({ email: email.trim().toLowerCase(), password, captchaToken: this.captcha()! })
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.recaptcha()?.reset();
        }),
      )
      .subscribe({
        // TODO: cuando exista el panel, navegar según el rol (cliente / prestador)
        next: () => this.success.set(true),
        error: (err) => this.serverError.set(this.messageFor(err)),
      });
  }

  private messageFor(err: unknown): string {
    if (err instanceof LoginError) {
      if (err.code === 'INVALID_CREDENTIALS')
        return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.';
      if (err.code === 'ACCOUNT_DISABLED')
        return 'Tu cuenta está deshabilitada. Contacta a soporte para reactivarla.';
      if (err.code === 'CAPTCHA_FAILED')
        return 'No pudimos verificar el captcha. Inténtalo de nuevo.';
    }

    return 'No pudimos iniciar sesión. Inténtalo de nuevo en unos minutos.';
  }
}
