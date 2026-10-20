import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { BankAccount } from '../../models/profiles.models';
import { ProfilesService } from '../../services/profiles.service';

type AccountType = BankAccount['tipoCuenta'];

const BANKS = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco AV Villas',
  'Banco Caja Social',
  'Scotiabank Colpatria',
  'Banco Agrario',
  'Itaú',
  'Banco Falabella',
  'Bancoomeva',
  'Banco Pichincha',
  'Banco GNB Sudameris',
  'Banco W',
  'Lulo Bank',
  'Nu Colombia',
  'Nequi',
  'Daviplata',
];

const TYPE_LABEL: Record<AccountType, string> = { ahorros: 'Ahorros', corriente: 'Corriente' };

const ERRORS: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'Verifica tu correo para registrar o cambiar tu información bancaria.',
  BANK_ACCOUNT_LOCKED: 'No puedes cambiarla mientras tengas contrataciones en curso. Podrás hacerlo cuando terminen.',
};

const VISIBLE_STATES = ['Aceptado', 'Confirmado', 'En curso', 'Finalizado'];

@Component({
  selector: 'app-bank-account',
  imports: [RouterLink, Icon],
  templateUrl: './bank-account.html',
  styleUrls: ['../_profile-page.scss', './bank-account.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAccountPage {
  private readonly profiles = inject(ProfilesService);
  protected readonly session = inject(CurrentUserService);

  protected readonly typeLabel = TYPE_LABEL;
  protected readonly visibleStates = VISIBLE_STATES;
  protected readonly types: AccountType[] = ['ahorros', 'corriente'];

  protected readonly account = signal<BankAccount | null | undefined>(undefined);
  protected readonly loadError = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showNumber = signal(false);

  protected readonly bank = signal('');
  protected readonly type = signal<AccountType>('ahorros');
  protected readonly number = signal('');
  protected readonly touched = signal(false);

  protected readonly emailVerified = computed(() => !!this.session.current()?.emailVerificado);
  protected readonly locked = computed(() => this.account()?.editable === false);

  protected readonly banks = computed(() => {
    const current = this.account()?.banco;
    return current && !BANKS.includes(current) ? [current, ...BANKS] : BANKS;
  });

  protected readonly numberError = computed(() => {
    const n = this.number();
    if (!n) return 'Escribe el número de la cuenta.';
    return /^\d{6,20}$/.test(n) ? null : 'El número debe tener entre 6 y 20 dígitos, sin espacios ni guiones.';
  });

  protected readonly preview = computed(() => {
    const a = this.account();
    return this.editing()
      ? { banco: this.bank(), tipoCuenta: this.type(), numero: this.number() }
      : a
        ? { banco: a.banco, tipoCuenta: a.tipoCuenta, numero: a.numero }
        : null;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.profiles.getBankAccount().subscribe({
      next: (a) => this.account.set(a),
      error: () => this.loadError.set(true),
    });
  }

  protected mask(numero: string): string {
    return `•••• ${numero.slice(-4)}`;
  }

  protected edit(): void {
    const a = this.account();
    this.bank.set(a?.banco ?? '');
    this.type.set(a?.tipoCuenta ?? 'ahorros');
    this.number.set(a?.numero ?? '');
    this.touched.set(false);
    this.error.set(null);
    this.saved.set(false);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  protected setNumber(value: string): void {
    this.number.set(value.replace(/[\s-]/g, ''));
  }

  protected save(): void {
    this.touched.set(true);
    if (this.saving() || !this.bank() || this.numberError()) return;
    this.error.set(null);
    this.saving.set(true);
    this.profiles
      .saveBankAccount({ banco: this.bank(), tipoCuenta: this.type(), numero: this.number() })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (a) => {
          this.account.set(a);
          this.editing.set(false);
          this.showNumber.set(false);
          this.saved.set(true);
        },
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          if (code === 'BANK_ACCOUNT_LOCKED') this.account.update((a) => (a ? { ...a, editable: false } : a));
          this.error.set(ERRORS[code] ?? 'No pudimos guardar tu información bancaria. Inténtalo de nuevo.');
        },
      });
  }
}
