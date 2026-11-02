import { ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { Observable } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop } from '../../../../shared/utils/format';
import { BankAccountView } from '../../models/contract';

type Mode = 'pse' | 'transfer';
type PseStep = 'intro' | 'processing' | 'approved' | 'rejected';

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
            @case ('intro') {
              <header class="dialog__head">
                <div>
                  <h2>Pagar con PSE</h2>
                  <p>Te llevamos a la pasarela para que elijas tu banco y apruebes el pago.</p>
                </div>
                <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar"><app-icon name="x" [size]="18" /></button>
              </header>
              <div class="amount"><span>Total a pagar</span><strong>{{ cop(amount()) }}</strong></div>
              <p class="note">
                <app-icon name="lock" [size]="16" />
                El monto es el valor acordado y no se puede cambiar. Confiance no guarda los datos de tu banco.
              </p>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
                <button type="button" class="btn btn--primary btn--sm" (click)="startPse()">Ir a la pasarela</button>
              </footer>
            }
            @case ('processing') {
              <div class="result" role="status">
                <span class="result__icon result__icon--wait"><app-icon name="credit-card" [size]="48" /></span>
                <h2>Procesando el pago…</h2>
                <p class="note">Estamos esperando la respuesta de la pasarela.</p>
              </div>
            }
            @case ('approved') {
              <div class="result" role="status">
                <span class="result__icon result__icon--ok"><app-icon name="circle-check" [size]="48" /></span>
                <h2>Pago aprobado</h2>
                <p class="note">Pagaste {{ cop(amount()) }}. Le avisamos a {{ counterpart() }}.</p>
              </div>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--primary btn--sm" (click)="close()">Listo</button>
              </footer>
            }
            @case ('rejected') {
              <div class="result" role="alert">
                <span class="result__icon result__icon--error"><app-icon name="x-circle" [size]="48" /></span>
                <h2>El pago no se completó</h2>
                <p class="note">El banco rechazó la transacción. Puedes intentarlo de nuevo o pagar por transferencia.</p>
              </div>
              <footer class="dialog__foot">
                <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Cerrar</button>
                <button type="button" class="btn btn--primary btn--sm" (click)="step.set('intro')">Intentar de nuevo</button>
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
  protected readonly mode = signal<Mode>('pse');
  protected readonly step = signal<PseStep>('intro');
  protected readonly amount = signal(0);
  protected readonly counterpart = signal('');
  protected readonly bank = signal<BankAccountView | null>(null);
  protected readonly transferred = signal(false);

  private pay: (() => Observable<boolean>) | null = null;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  openPse(amount: number, counterpart: string, pay: () => Observable<boolean>): void {
    this.mode.set('pse');
    this.step.set('intro');
    this.amount.set(amount);
    this.counterpart.set(counterpart);
    this.pay = pay;
    this.dialog().nativeElement.showModal();
  }

  openTransfer(amount: number, counterpart: string, bank: BankAccountView): void {
    this.mode.set('transfer');
    this.amount.set(amount);
    this.counterpart.set(counterpart);
    this.bank.set(bank);
    this.transferred.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected startPse(): void {
    if (!this.pay) return;
    this.step.set('processing');
    this.pay().subscribe({
      next: (approved) => this.step.set(approved ? 'approved' : 'rejected'),
      error: () => this.step.set('rejected'),
    });
  }

  protected confirmTransfer(): void {
    this.transferMarked.emit();
    this.close();
  }

  protected close(): void {
    if (this.step() === 'processing') return;
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
