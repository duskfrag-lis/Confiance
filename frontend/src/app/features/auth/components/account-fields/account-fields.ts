import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AccountGroup, PASSWORD_RULES } from '../../forms/auth-forms';
import { DigitsOnly } from '../../../../shared/directives/digits-only';

const MESSAGES = {
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
  email: {
    required: 'Ingresa tu correo electrónico.',
    email: 'Ingresa un correo electrónico válido.',
    taken: 'Ya existe una cuenta con este correo.',
  },
  password: {
    required: 'Ingresa tu contraseña.',
    passwordRules: 'Tu contraseña aún no cumple todos los requisitos.',
  },
  confirmPassword: {
    required: 'Confirma tu contraseña.',
    mismatch: 'Las contraseñas no coinciden.',
  },
} satisfies Record<keyof AccountGroup['controls'], Record<string, string>>;

const STRENGTH_LABELS = ['Vacía', 'Muy débil', 'Débil', 'Media', 'Buena', 'Fuerte'];

@Component({
  selector: 'app-account-fields',
  imports: [DigitsOnly, ReactiveFormsModule, FieldError, Icon],
  templateUrl: './account-fields.html',
  styleUrl: './account-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountFields implements OnInit {
  readonly group = input.required<AccountGroup>();

  readonly submitted = input(false);

  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);
  protected readonly password = signal('');

  protected readonly bars = [0, 1, 2, 3, 4];
  protected readonly rules = computed(() =>
    PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(this.password()) })),
  );

  protected readonly met = computed(() => this.rules().filter((r) => r.met).length);
  protected readonly level = computed(() => (this.password() ? Math.max(this.met(), 1) : 0));
  protected readonly label = computed(() => STRENGTH_LABELS[this.level()]);

  ngOnInit(): void {
    // Errores que llegan del servidor (correo o cédula ya registrados) cambian el estado sin tocar los inputs
    this.group()
      .events.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());

    const ctrl = this.group().controls.password;
    this.password.set(ctrl.value);
    ctrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.password.set(v));
  }

  protected err(name: keyof AccountGroup['controls']): string | null {
    const c = this.group().controls[name];

    if (c.valid || !(c.touched || this.submitted())) return null;

    const map = MESSAGES[name] as Record<string, string>;
    const key = Object.keys(c.errors ?? {}).find((k) => map[k]);

    return key ? map[key] : null;
  }
}
