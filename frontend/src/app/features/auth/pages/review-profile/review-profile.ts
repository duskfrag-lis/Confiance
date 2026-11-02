import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { homeFor } from '../../../../core/services/current-user.service';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthShell } from '../../components/auth-shell/auth-shell';
import { TradePicker } from '../../components/trade-picker/trade-picker';
import { byDigits, colombianMobile, focusField, markTaken, NIT_DV_MESSAGE, NIT_MESSAGE, nitFormat, notBlank, toNit } from '../../forms/auth-forms';
import { RegisterError } from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';
import { DigitsOnly } from '../../../../shared/directives/digits-only';

type FieldName = 'nombres' | 'apellidos' | 'cedula' | 'telefono' | 'nit';

const MESSAGES: Record<FieldName, Record<string, string>> = {
  nombres: { required: 'Ingresa tus nombres.' },
  apellidos: { required: 'Ingresa tus apellidos.' },
  cedula: {
    required: 'Ingresa tu número de cédula.',
    pattern: 'La cédula debe tener entre 6 y 10 dígitos.',
    taken: 'Ya existe una cuenta con esta cédula.',
  },
  telefono: {
    required: 'Ingresa tu número de celular.',
    phoneStart: 'El número de celular debe empezar por 3.',
    phoneLength: 'El número de celular debe tener 10 dígitos.',
  },
  nit: { pattern: NIT_MESSAGE, nitDv: NIT_DV_MESSAGE, taken: 'Ya existe una cuenta con este NIT.' },
};

/**
 * D-47: al vincular Google o Microsoft a una cuenta que no tenía el correo verificado, los datos
 * personales los pudo escribir otra persona. El dueño los confirma antes de seguir (authGuard).
 */
@Component({
  selector: 'app-review-profile',
  imports: [DigitsOnly, ReactiveFormsModule, AuthShell, FieldError, Icon, TradePicker],
  templateUrl: './review-profile.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewProfile {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly heroItems = [
    'Tu correo ya está verificado',
    'Confirma que estos datos son tuyos',
  ];

  protected readonly form = new FormGroup({
    nombres: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    apellidos: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.pattern(/^\d{6,10}$/)],
    }),
    telefono: new FormControl('', { nonNullable: true, validators: [notBlank, colombianMobile] }),
    nit: new FormControl('', { nonNullable: true, validators: [nitFormat] }),
  });

  protected readonly isProvider = signal(false);
  protected readonly selected = signal<string[]>([]);

  protected readonly loaded = signal(false);
  protected readonly submitted = signal(false);
  protected readonly loading = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    this.auth
      .getPersonalData()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.form.patchValue({ ...data, nit: data.prestador?.nit ?? '' });
          this.isProvider.set(data.prestador !== null);
          this.selected.set(data.prestador?.oficios ?? []);
          this.loaded.set(true);
        },
        error: () => {
          this.loaded.set(true);
          this.serverError.set('No pudimos cargar tus datos. Escríbelos de nuevo.');
        },
      });
  }

  protected err(name: FieldName): string | null {
    const c = this.form.controls[name];

    if (c.valid || !(c.touched || this.submitted())) return null;

    const key = Object.keys(c.errors ?? {}).find((k) => MESSAGES[name][k]);

    return key ? MESSAGES[name][key] : null;
  }

  protected oficiosError(): string | null {
    return this.isProvider() && this.submitted() && this.selected().length === 0
      ? 'Elige al menos un oficio para continuar.'
      : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.oficiosError() || this.loading()) return;

    const v = this.form.getRawValue();

    this.loading.set(true);
    this.auth
      .confirmPersonalData({
        nombres: v.nombres.trim(),
        apellidos: v.apellidos.trim(),
        cedula: v.cedula.trim(),
        telefono: v.telefono.replace(/\s/g, ''),
        ...(this.isProvider() ? { nit: toNit(v.nit), oficios: this.selected() } : {}),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (user) => this.router.navigateByUrl(homeFor(user)),
        error: (err) => {
          if (err instanceof RegisterError && err.code === 'CEDULA_TAKEN') {
            markTaken(this.form.controls.cedula);
            focusField('cedula');
          } else if (err instanceof RegisterError && err.code === 'NIT_TAKEN') {
            markTaken(this.form.controls.nit, byDigits);
            focusField('nit');
          } else {
            this.serverError.set('No pudimos guardar tus datos. Inténtalo de nuevo en unos minutos.');
          }
        },
      });
  }
}
