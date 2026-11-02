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

const byText = (v: unknown) => String(v ?? '').trim().toLowerCase();
/** El NIT con o sin guion es el mismo (el backend guarda un solo formato, D-09). */
export const byDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/**
 * El backend rechazó este valor (correo o cédula ya registrados). Queda como validación del control, así el error
 * no se borra cuando Angular vuelve a validar (por ejemplo, al regresar al paso 1) y desaparece solo al cambiarlo.
 */
export function markTaken(control: AbstractControl<string>, normalize = byText): void {
  const rejected = normalize(control.value);

  control.addValidators((c) => (normalize(c.value) === rejected ? { taken: true } : null));
  control.markAsTouched();
  control.updateValueAndValidity();
}

/** Lleva el cursor al primer campo que el backend rechazó, para que el error se vea debajo de él. */
export function focusTaken(account: AccountGroup): void {
  const id = (['cedula', 'email'] as const).find((k) => account.controls[k].hasError('taken'));
  if (id) focusField(id);
}

export function focusField(id: string): void {
  // Espera a que el campo vuelva a estar en pantalla (por ejemplo, al regresar al paso 1)
  setTimeout(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  });
}

/**
 * NIT colombiano: número base y dígito de verificación. Una empresa tiene 9 dígitos (900123456-8); una persona
 * natural usa su cédula, de 6 a 10 dígitos. El guion es opcional al escribirlo.
 */
export const NIT_RE = /^\d{6,10}-?\d$/;
export const NIT_MESSAGE = 'Ingresa el NIT con su dígito de verificación (ej. 900123456-8).';
export const NIT_DV_MESSAGE = 'El dígito de verificación no coincide. Revisa el NIT en tu RUT.';
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de la DIAN: el mismo para empresas y personas naturales (igual que el backend). */
export const nitCheckDigit = (base: string): number => {
  const sum = [...base].reverse().reduce((acc, d, i) => acc + Number(d) * NIT_WEIGHTS[i], 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
};

/** Mensaje de error del NIT, o null si está vacío (es opcional) o es válido. */
export const nitError = (value: string): string | null => {
  const v = value.replace(/\s/g, '');
  if (!v) return null;
  if (!NIT_RE.test(v)) return NIT_MESSAGE;
  const digits = v.replace(/\D/g, '');
  return nitCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1)) ? null : NIT_DV_MESSAGE;
};

export const toNit = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  return digits ? `${digits.slice(0, -1)}-${digits.slice(-1)}` : null;
};

export const nitFormat: ValidatorFn = (c) => {
  const msg = nitError(String(c.value ?? ''));
  return !msg ? null : msg === NIT_MESSAGE ? { pattern: true } : { nitDv: true };
};

export const notBlank: ValidatorFn = (c) =>
  typeof c.value === 'string' && c.value.trim().length > 0 ? null : { required: true };

export const emailFormat: ValidatorFn = (c) => {
  const v = String(c.value ?? '').trim();

  return !v || EMAIL_RE.test(v) ? null : { email: true };
};

export const colombianMobile: ValidatorFn = (c) => {
  const v = String(c.value ?? '').replace(/\s/g, '');

  if (!v) return null;
  if (!v.startsWith('3')) return { phoneStart: true };
  return /^\d{10}$/.test(v) ? null : { phoneLength: true };
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
    markTaken(account.controls.email);

    return { message: null, backToAccount: true };
  }

  if (err instanceof RegisterError && err.code === 'CEDULA_TAKEN') {
    markTaken(account.controls.cedula);

    return { message: null, backToAccount: true };
  }

  if (err instanceof RegisterError && err.code === 'INVALID_CATEGORY') {
    return { message: 'Alguno de los oficios ya no está disponible. Elige otro.', backToAccount: false };
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
