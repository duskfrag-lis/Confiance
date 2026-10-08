import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { TradePicker } from '../../components/trade-picker/trade-picker';
import { colombianMobile, notBlank } from '../../forms/auth-forms';
import { AccountRole, RegisterError, SocialPending } from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';

type FieldName = 'nombres' | 'apellidos' | 'cedula' | 'telefono' | 'nit' | 'terms';

const MESSAGES: Record<FieldName, Record<string, string>> = {
  nombres: { required: 'Ingresa tus nombres.' },
  apellidos: { required: 'Ingresa tus apellidos.' },
  cedula: {
    required: 'Ingresa tu cédula.',
    pattern: 'Ingresa una cédula válida (solo números, entre 6 y 10 dígitos).',
    taken: 'Esta cédula ya está registrada.',
  },
  telefono: {
    required: 'Ingresa tu número de teléfono.',
    phone: 'Ingresa un número de celular válido (10 dígitos).',
  },
  nit: { pattern: 'Ingresa un NIT válido (ej. 900123456-7).' },
  terms: { required: 'Debes aceptar los términos para crear tu cuenta.' },
};

@Component({
  selector: 'app-complete-profile',
  imports: [ReactiveFormsModule, AuthShell, FieldError, Icon, TradePicker],
  templateUrl: './complete-profile.html',
  styleUrl: './complete-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompleteProfile {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly heroItems = [
    'Tu correo ya está verificado',
    'Solo faltan unos datos para activar tu cuenta',
  ];

  protected readonly pending = signal<SocialPending | null>(null);
  protected readonly providerName = computed(() =>
    this.pending()?.provider === 'microsoft' ? 'Microsoft' : 'Google',
  );

  /** El rol puede venir preseleccionado desde el registro (?rol=prestador) */
  protected readonly role = signal<AccountRole>(
    this.query.get('rol') === 'prestador' ? 'prestador' : 'cliente',
  );
  protected readonly selected = signal<string[]>([]);

  protected readonly form = new FormGroup({
    nombres: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    apellidos: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.pattern(/^\d{6,10}$/)],
    }),
    telefono: new FormControl('', { nonNullable: true, validators: [notBlank, colombianMobile] }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d{9}-?\d$/)],
    }),
    terms: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    if (this.role() === 'cliente') this.form.controls.nit.disable();

    this.auth
      .getPendingSocial(this.query.get('proveedor'))
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (p) => {
          this.pending.set(p);
          this.form.patchValue({ nombres: p.nombres, apellidos: p.apellidos });
        },
        // Sin sesión social pendiente: de vuelta al login
        error: () =>
          this.router.navigate(['/auth/iniciar-sesion'], { queryParams: { error: 'social' } }),
      });
  }

  protected setRole(role: AccountRole): void {
    this.role.set(role);
    const nit = this.form.controls.nit;

    if (role === 'cliente') nit.disable();
    else nit.enable();
  }

  protected err(name: FieldName): string | null {
    const c = this.form.controls[name];

    if (c.disabled || c.valid || !(c.touched || this.submitted())) return null;

    const key = Object.keys(c.errors ?? {}).find((k) => MESSAGES[name][k]);

    return key ? MESSAGES[name][key] : null;
  }

  protected oficiosError(): string | null {
    return this.role() === 'prestador' && this.submitted() && this.selected().length === 0
      ? 'Elige al menos un oficio para continuar.'
      : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.oficiosError() || this.loading()) return;

    const v = this.form.getRawValue();

    const base = {
      rol: this.role(),
      nombres: v.nombres.trim(),
      apellidos: v.apellidos.trim(),
      cedula: v.cedula.trim(),
      telefono: v.telefono.replace(/\s/g, ''),
      aceptaTerminos: true as const,
    };

    this.loading.set(true);
    this.auth
      .completeSocialProfile(
        this.role() === 'prestador'
          ? { ...base, oficios: this.selected(), nit: v.nit.trim() || null }
          : base,
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        // TODO: cuando exista el panel, navegar según el rol
        next: () => this.success.set(true),

        error: (err) => {
          if (err instanceof RegisterError && err.code === 'CEDULA_TAKEN') {
            this.form.controls.cedula.setErrors({ taken: true });
            this.form.controls.cedula.markAsTouched();
          } else {
            this.serverError.set(
              'No pudimos completar tu perfil. Inténtalo de nuevo en unos minutos.',
            );
          }
        },
      });
  }

  protected cancel(): void {
    if (this.cancelling()) return;

    this.cancelling.set(true);
    this.auth
      .cancelSocialSignup()
      .pipe(finalize(() => this.router.navigateByUrl('/')))
      .subscribe();
  }
}
