import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RegisterClientPayload, RegisterError } from '../models/auth.models';

export const PASSWORD_RULES = [
  {
    key: 'length',
    label: 'Entre 6 y 20 caracteres',
    test: (v: string) => v.length >= 6 && v.length <= 20,
  },
  { key: 'upper', label: 'Una letra mayúscula', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'Una letra minúscula', test: (v: string) => /[a-z]/.test(v) },
  { key: 'number', label: 'Un número', test: (v: string) => /\d/.test(v) },
  {
    key: 'special',
    label: 'Un carácter especial (! @ # $ %)',
    test: (v: string) => /[!@#$%]/.test(v),
  },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const notBlank: ValidatorFn = (c) =>
  typeof c.value === 'string' && c.value.trim().length > 0 ? null : { required: true };

export const emailFormat: ValidatorFn = (c) => {
  const v = String(c.value ?? '').trim();

  return !v || EMAIL_RE.test(v) ? null : { email: true };
};

export const colombianMobile: ValidatorFn = (c) => {
  const v = String(c.value ?? '').replace(/\s/g, '');

  return !v || /^3\d{9}$/.test(v) ? null : { phone: true };
};

export const passwordRules: ValidatorFn = (c) => {
  const v = String(c.value ?? '');

  return !v || PASSWORD_RULES.every((r) => r.test(v)) ? null : { passwordRules: true };
};

export function matchesField(otherName: string): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (!c.value) return null;

    const other = c.parent?.get(otherName);

    return other && other.value === c.value ? null : { mismatch: true };
  };
}

export function buildAccountGroup() {
  const group = new FormGroup({
    nombres: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    apellidos: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.pattern(/^\d{6,10}$/)],
    }),
    telefono: new FormControl('', { nonNullable: true, validators: [notBlank, colombianMobile] }),
    email: new FormControl('', { nonNullable: true, validators: [notBlank, emailFormat] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, passwordRules],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, matchesField('password')],
    }),
  });

  group.controls.password.valueChanges.subscribe(() =>
    group.controls.confirmPassword.updateValueAndValidity(),
  );

  return group;
}

export type AccountGroup = ReturnType<typeof buildAccountGroup>;

export function toBasePayload(
  v: ReturnType<AccountGroup['getRawValue']>,
): Omit<RegisterClientPayload, 'captchaToken'> {
  return {
    nombres: v.nombres.trim(),
    apellidos: v.apellidos.trim(),
    cedula: v.cedula.trim(),
    telefono: v.telefono.replace(/\s/g, ''),
    email: v.email.trim().toLowerCase(),
    password: v.password,
    aceptaTerminos: true,
  };
}

export function applyRegisterError(
  err: unknown,
  account: AccountGroup,
): { message: string | null; backToAccount: boolean } {
  if (err instanceof RegisterError && err.code === 'EMAIL_TAKEN') {
    account.controls.email.setErrors({ taken: true });
    account.controls.email.markAsTouched();

    return { message: null, backToAccount: true };
  }

  if (err instanceof RegisterError && err.code === 'CEDULA_TAKEN') {
    account.controls.cedula.setErrors({ taken: true });
    account.controls.cedula.markAsTouched();

    return { message: null, backToAccount: true };
  }

  if (err instanceof RegisterError && err.code === 'CAPTCHA_FAILED') {
    return {
      message: 'No pudimos verificar el captcha. Inténtalo de nuevo.',
      backToAccount: false,
    };
  }

  return {
    message: 'No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos.',
    backToAccount: false,
  };
}
