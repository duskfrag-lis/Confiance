import { ChangeDetectionStrategy, Component, ElementRef, computed, output, signal, viewChild } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop } from '../../../../shared/utils/format';
import { PseBank, PsePayer, PseStart, PseTerms } from '../../models/contract-api.models';
import { BankAccountView } from '../../models/contract';
import { CONTRACT_ERRORS } from '../../models/contract-errors';

type Mode = 'pse' | 'transfer';
type PseStep = 'loading' | 'unavailable' | 'form' | 'redirecting' | 'waiting' | 'rejected';

/** Lo que el diálogo necesita del API para pagar por PSE (HU-43). */
export interface PseGateway {
  banks: () => Observable<PseBank[]>;
  terms: () => Observable<PseTerms>;
  pay: (payer: PsePayer) => Observable<PseStart>;
}

const DOCUMENT_TYPES: { id: PsePayer['tipoDocumento']; label: string }[] = [
  { id: 'CC', label: 'Cédula de ciudadanía' },
  { id: 'CE', label: 'Cédula de extranjería' },
  { id: 'NIT', label: 'NIT' },
  { id: 'PP', label: 'Pasaporte' },
  { id: 'TI', label: 'Tarjeta de identidad' },
];

@Component({
  selector: 'app-payment-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .amount {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0.9rem 1rem;
      border-radius: 12px;
      background: var(--c-surface-2);

      strong {
        font-size: 1.5rem;
      }
    }
    .bank {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 0.5rem 1.25rem;
      margin: 0;
      padding: 0.9rem 1rem;
      border: 1px solid var(--c-border);
      border-radius: 12px;
      background: var(--c-white);

      dt {
        color: var(--c-muted);
      }
      dd {
        margin: 0;
        font-weight: 600;
      }
    }
    .field {
      display: grid;
      gap: 0.4rem;
      font-weight: 600;
    }
    .field select,
    .field input {
      width: 100%;
      height: 44px;
      padding: 0 0.9rem;
      border: 1px solid var(--c-border);
      border-radius: var(--radius);
      background: var(--c-white);
      color: var(--c-text);
      font: inherit;
      font-weight: 400;
      &:focus {
        outline: 2px solid var(--c-primary);
        outline-offset: -1px;
      }
    }
    .doc {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 0.6rem;
    }
    .persona {
      display: flex;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      border: 0;

      legend {
        margin-bottom: 0.4rem;
        font-weight: 600;
      }
      label {
        flex: 1;
        cursor: pointer;
      }
      input {
        position: absolute;
        opacity: 0;
      }
      span {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        border: 1px solid var(--c-border);
        border-radius: 999px;
        background: var(--c-white);
        transition:
          border-color var(--dur-fast) var(--ease-out),
          background-color var(--dur-fast) var(--ease-out);
      }
      input:checked + span {
        border-color: var(--c-primary);
        background: var(--c-primary-soft);
        color: var(--c-primary-dark);
        font-weight: 600;
      }
      input:focus-visible + span {
        outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
        outline-offset: 2px;
      }
    }
    .toggle a {
      color: var(--c-primary-dark);
    }
    .error {
      color: var(--c-error);
      font-size: 0.9375rem;
    }
    @media (max-width: 560px) {
      .doc {
        grid-template-columns: 1fr;
      }
    }
    .note {
      display: flex;
      gap: 0.5rem;
      color: var(--c-muted);
      font-size: 0.9375rem;

      app-icon {
        margin-top: 0.15rem;
      }
    }
    .toggle {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      font-weight: 600;
      cursor: pointer;

      input {
        width: 20px;
        height: 20px;
        margin-top: 0.1rem;
        accent-color: var(--c-primary);
      }
    }
    .result {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
      padding: 1rem 0 0.5rem;
      text-align: center;
    }
    .result__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;

      &--ok {
        color: var(--c-success);
      }
      &--error {
        color: var(--c-error);
      }
      &--wait {
        color: var(--c-primary-dark);
        animation: pulse 1.2s var(--ease-out) infinite;
      }
    }
    @keyframes pulse {
      50% {
        transform: scale(0.92);
        opacity: 0.7;
      }
    }
  `,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)" (close)="closed.emit()">
      <div class="dialog__form">
        @if (mode() === 'pse') {
          @switch (step()) {
            @case ('loading') {
              <div class="result" role="status">
                <span class="result__icon result__icon--wait"><app-icon name="credit-card" [size]="48" /></span>
                <p class="note">Cargando los bancos de PSE…</p>
              </div>
            }
            @case ('unavailable') {
              <div class="result" role="alert">
                <span class="result__icon result__icon--error"><app-icon name="x-circle" [size]="48" /></span>
                <h2>PSE no está disponible</h2>
                <p class="note">No pudimos conectar con la pasarela. Inténtalo en unos minutos{{ canTransfer() ? ' o paga por transferencia' : '' }}.</p>
              </div>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--primary btn--sm" (click)="close()">Cerrar</button>
              </footer>
            }
            @case ('form') {
              <header class="dialog__head">
                <div>
                  <h2>Pagar con PSE</h2>
                  <p>Elige tu banco y te llevamos a él para que apruebes el pago.</p>
                </div>
                <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar"><app-icon name="x" [size]="18" /></button>
              </header>
              <div class="amount"><span>Total a pagar</span><strong>{{ cop(amount()) }}</strong></div>

              <label class="field">
                Banco
                <select [value]="bankCode()" (change)="bankCode.set($any($event.target).value)">
                  <option value="" disabled>Elige tu banco</option>
                  @for (b of banks(); track b.codigo) {
                    <option [value]="b.codigo">{{ b.nombre }}</option>
                  }
                </select>
              </label>

              <fieldset class="persona">
                <legend>Pagas como</legend>
                <label>
                  <input type="radio" name="persona" [checked]="person() === 'natural'" (change)="setPerson('natural')" />
                  <span>Persona natural</span>
                </label>
                <label>
                  <input type="radio" name="persona" [checked]="person() === 'juridica'" (change)="setPerson('juridica')" />
                  <span>Empresa</span>
                </label>
              </fieldset>

              <div class="doc">
                <label class="field">
                  Tipo de documento
                  <select [value]="docType()" (change)="docType.set($any($event.target).value)">
                    @for (d of documentTypes; track d.id) {
                      <option [value]="d.id">{{ d.label }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  Número
                  <input
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="15"
                    [value]="doc()"
                    (input)="doc.set($any($event.target).value)"
                  />
                </label>
              </div>

              <label class="toggle">
                <input type="checkbox" [checked]="accepted()" (change)="accepted.set($any($event.target).checked)" />
                <span>
                  Acepto los <a [href]="terms()?.terminosUrl" target="_blank" rel="noopener">términos y condiciones</a> y la
                  <a [href]="terms()?.datosPersonalesUrl" target="_blank" rel="noopener">autorización de datos personales</a> de Wompi.
                </span>
              </label>

              <p class="note">
                <app-icon name="lock" [size]="16" />
                El monto es el valor acordado y no se puede cambiar. Confiance no guarda los datos de tu banco.
              </p>
              @if (error(); as e) {
                <p class="error" role="alert">{{ e }}</p>
              }
              <footer class="dialog__foot">
                <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
                <button type="button" class="btn btn--primary btn--sm" [disabled]="!valid()" (click)="startPse()">Ir a mi banco</button>
              </footer>
            }
            @case ('redirecting') {
              <div class="result" role="status">
                <span class="result__icon result__icon--wait"><app-icon name="credit-card" [size]="48" /></span>
                <h2>Te llevamos a tu banco…</h2>
                <p class="note">Al terminar, el banco te devuelve a Confiance.</p>
              </div>
            }
            @case ('waiting') {
              <div class="result" role="status">
                <span class="result__icon result__icon--wait"><app-icon name="clock" [size]="48" /></span>
                <h2>El pago está en proceso</h2>
                <p class="note">La pasarela aún no responde. Te avisaremos apenas se confirme.</p>
              </div>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--primary btn--sm" (click)="close()">Entendido</button>
              </footer>
            }
            @case ('rejected') {
              <div class="result" role="alert">
                <span class="result__icon result__icon--error"><app-icon name="x-circle" [size]="48" /></span>
                <h2>El pago no se completó</h2>
                <p class="note">El banco rechazó la transacción. Puedes intentarlo de nuevo{{ canTransfer() ? ' o pagar por transferencia' : '' }}.</p>
              </div>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Cerrar</button>
                <button type="button" class="btn btn--primary btn--sm" (click)="step.set('form')">Intentar de nuevo</button>
              </footer>
            }
          }
        } @else {
          <header class="dialog__head">
            <div>
              <h2>Pagar por transferencia</h2>
              <p>Transfiere desde tu banco y después marca que ya pagaste. {{ counterpart() }} confirmará que la recibió.</p>
            </div>
            <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar"><app-icon name="x" [size]="18" /></button>
          </header>
          <div class="amount"><span>Valor a transferir</span><strong>{{ cop(amount()) }}</strong></div>
          @if (bank(); as b) {
            <dl class="bank">
              <dt>Banco</dt>
              <dd>{{ b.bank }}</dd>
              <dt>Tipo de cuenta</dt>
              <dd>{{ b.type }}</dd>
              <dt>Número</dt>
              <dd>{{ b.number }}</dd>
            </dl>
          }
          <p class="note">
            <app-icon name="info" [size]="16" />
            El dinero va directo a la cuenta del prestador; no pasa por Confiance.
          </p>
          <label class="toggle">
            <input type="checkbox" [checked]="transferred()" (change)="transferred.set($any($event.target).checked)" />
            Ya transferí {{ cop(amount()) }} a esta cuenta.
          </label>
          <footer class="dialog__foot">
            <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
            <button type="button" class="btn btn--primary btn--sm" [disabled]="!transferred()" (click)="confirmTransfer()">
              Marcar como pagado
            </button>
          </footer>
        }
      </div>
    </dialog>
  `,
})
export class PaymentDialog {
  readonly transferMarked = output<void>();
  readonly closed = output<void>();

  protected readonly cop = formatCop;
  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly mode = signal<Mode>('pse');
  protected readonly step = signal<PseStep>('loading');
  protected readonly amount = signal(0);
  protected readonly counterpart = signal('');
  protected readonly bank = signal<BankAccountView | null>(null);
  protected readonly canTransfer = signal(false);
  protected readonly transferred = signal(false);

  protected readonly banks = signal<PseBank[]>([]);
  protected readonly terms = signal<PseTerms | null>(null);
  protected readonly bankCode = signal('');
  protected readonly person = signal<PsePayer['tipoPersona']>('natural');
  protected readonly docType = signal<PsePayer['tipoDocumento']>('CC');
  protected readonly doc = signal('');
  protected readonly accepted = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(
    () => !!this.bankCode() && /^[A-Za-z0-9]{5,15}$/.test(this.doc().replace(/[\s.-]/g, '')) && this.accepted(),
  );

  private gateway: PseGateway | null = null;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  openPse(amount: number, counterpart: string, canTransfer: boolean, gateway: PseGateway): void {
    this.mode.set('pse');
    this.amount.set(amount);
    this.counterpart.set(counterpart);
    this.canTransfer.set(canTransfer);
    this.gateway = gateway;
    this.error.set(null);
    this.accepted.set(false);
    this.dialog().nativeElement.showModal();

    if (this.banks().length && this.terms()) {
      this.step.set('form');
      return;
    }
    this.step.set('loading');
    forkJoin([gateway.banks(), gateway.terms()]).subscribe({
      next: ([banks, terms]) => {
        this.banks.set(banks);
        this.terms.set(terms);
        this.step.set('form');
      },
      error: () => this.step.set('unavailable'),
    });
  }

  openTransfer(amount: number, counterpart: string, bank: BankAccountView): void {
    this.mode.set('transfer');
    this.amount.set(amount);
    this.counterpart.set(counterpart);
    this.bank.set(bank);
    this.transferred.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected setPerson(person: PsePayer['tipoPersona']): void {
    this.person.set(person);
    this.docType.set(person === 'juridica' ? 'NIT' : 'CC');
  }

  protected startPse(): void {
    if (!this.gateway || !this.valid()) return;
    this.error.set(null);
    this.step.set('redirecting');
    this.gateway
      .pay({
        banco: this.bankCode(),
        tipoPersona: this.person(),
        tipoDocumento: this.docType(),
        documento: this.doc().replace(/[\s.-]/g, ''),
        aceptaTerminos: true,
      })
      .subscribe({
        next: (r) => {
          if (r.url) window.location.assign(r.url);
          else this.step.set(r.estado === 'rechazado' ? 'rejected' : 'waiting');
        },
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          if (code === 'PAYMENTS_UNAVAILABLE') return this.step.set('unavailable');
          this.error.set(CONTRACT_ERRORS[code] ?? 'No pudimos iniciar el pago. Inténtalo de nuevo.');
          this.step.set('form');
        },
      });
  }

  protected confirmTransfer(): void {
    this.transferMarked.emit();
    this.close();
  }

  protected close(): void {
    if (this.step() === 'redirecting') return;
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
