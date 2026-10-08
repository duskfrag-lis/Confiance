import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

@Component({
  selector: 'app-register-provider',
  imports: [ReactiveFormsModule, RouterLink, AuthShell, RoleTabs, AccountFields, FieldError, Icon, Recaptcha],
  templateUrl: './register-provider.html',
  styleUrl: './register-provider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterProvider {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingVerification);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly MAX_TRADES = 3;

  protected readonly heroItems = [
    'Perfil con tus oficios, zonas y disponibilidad',
    'Insignia de identidad verificada',
    'Calificaciones que construyen tu reputación',
  ];

  protected readonly step = signal<1 | 2>(1);
  protected readonly account = buildAccountGroup();
  protected readonly profile = new FormGroup({
    oficios: new FormControl<string[]>([], {
      nonNullable: true,
      validators: [(c) => (c.value.length >= 1 ? null : { required: true })],
    }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d{9}-?\d$/)],
    }),
    terms: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  protected readonly submittedAccount = signal(false);
  protected readonly submittedProfile = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly captcha = signal<string | null>(null);
  private readonly recaptcha = viewChild(Recaptcha);

  protected readonly trades = toSignal(this.auth.getTrades(), { initialValue: [] });
  protected readonly search = signal('');
  protected readonly selected = signal<string[]>([]);
  protected readonly filtered = computed(() => {
    const q = normalize(this.search());
    return q ? this.trades().filter((t) => normalize(t.name).includes(q)) : this.trades();
  });

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    const current = this.selected();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : current.length < this.MAX_TRADES
        ? [...current, id]
        : current;
    this.selected.set(next);
    this.profile.controls.oficios.setValue(next);
    this.profile.controls.oficios.markAsTouched();
  }

  protected oficiosError(): string | null {
    const c = this.profile.controls.oficios;
    return c.invalid && (c.touched || this.submittedProfile())
      ? 'Elige al menos un oficio para continuar.'
      : null;
  }

  protected nitError(): string | null {
    const c = this.profile.controls.nit;
    return c.invalid && (c.touched || this.submittedProfile())
      ? 'Ingresa un NIT válido (ej. 900123456-7).'
      : null;
  }

  protected termsError(): string | null {
    const c = this.profile.controls.terms;

    return c.invalid && (c.touched || this.submittedProfile())
      ? 'Debes aceptar los términos para crear tu cuenta.'
      : null;
  }

  protected next(): void {
    this.submittedAccount.set(true);

    if (this.account.invalid) return;

    this.step.set(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected back(): void {
    this.step.set(1);
    this.captcha.set(null); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected submit(): void {
    this.submittedProfile.set(true);
    this.serverError.set(null);
    this.profile.markAllAsTouched();

    if (this.account.invalid || this.profile.invalid || !this.captcha() || this.loading()) return;

    const { oficios, nit } = this.profile.getRawValue();

    this.loading.set(true);
    this.auth
    .registerProvider({
      ...toBasePayload(this.account.getRawValue()),
      oficios,
      nit: nit.trim() || null,
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

      error: (err) => {
        const { message, backToAccount } = applyRegisterError(err, this.account);
        this.serverError.set(message);

        if (backToAccount) {
          this.step.set(1);
          this.captcha.set(null);
        }
      },

    });
  }
}
