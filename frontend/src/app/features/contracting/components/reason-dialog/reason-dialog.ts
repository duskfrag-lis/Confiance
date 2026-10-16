import { ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

export interface ReasonDialogConfig {
  title: string;
  subtitle: string;
  label: string;
  placeholder: string;
  maxLength: number;
  required: boolean;
  confirmText: string;
  danger?: boolean;
}

@Component({
  selector: 'app-reason-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)" (close)="text.set('')">
      @if (config(); as c) {
        <form class="dialog__form" method="dialog" (submit)="submit($event)">
          <header class="dialog__head">
            <div>
              <h2>{{ c.title }}</h2>
              <p>{{ c.subtitle }}</p>
            </div>
            <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar">
              <app-icon name="x" [size]="18" />
            </button>
          </header>

          <label class="dialog__field">
            {{ c.label }}{{ c.required ? '' : ' (opcional)' }}
            <textarea
              [placeholder]="c.placeholder"
              [maxLength]="c.maxLength"
              [value]="text()"
              (input)="text.set($any($event.target).value)"
            ></textarea>
            <span class="dialog__hint">{{ text().length }}/{{ c.maxLength }}</span>
          </label>

          <footer class="dialog__foot">
            <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
            <button
              type="submit"
              class="btn btn--sm"
              [class.btn--danger]="c.danger"
              [class.btn--primary]="!c.danger"
              [disabled]="c.required && !text().trim()"
            >
              {{ c.confirmText }}
            </button>
          </footer>
        </form>
      }
    </dialog>
  `,
})
export class ReasonDialog {
  readonly confirmed = output<string>();

  protected readonly config = signal<ReasonDialogConfig | null>(null);
  protected readonly text = signal('');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(config: ReasonDialogConfig): void {
    this.config.set(config);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.confirmed.emit(this.text().trim());
    this.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
