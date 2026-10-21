import { ChangeDetectionStrategy, Component, ElementRef, computed, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

export interface CancelRequest {
  reason: string;
  forceMajeure: boolean;
  evidence: File | null;
}

type CancelMode = 'ordinary' | 'late' | 'in_progress';

const MAX_REASON = 500;
const MAX_FILE_MB = 5;
const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

@Component({
  selector: 'app-cancel-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .notice {
      display: flex;
      gap: 0.6rem;
      padding: 0.8rem 0.95rem;
      border-radius: 12px;
      background: var(--c-warning-bg);
      color: var(--c-warning-dark);
      font-size: 0.9375rem;
      app-icon {
        margin-top: 0.15rem;
      }
    }
    .notice__link {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
    .toggle {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      font-weight: 600;
      cursor: pointer;
      input {
        width: 20px;
        height: 20px;
        margin-top: 0.15rem;
        accent-color: var(--c-primary);
      }
      small {
        display: block;
        color: var(--c-muted);
        font-weight: 400;
      }
    }
    .file {
      display: grid;
      gap: 0.4rem;
      font-weight: 600;
    }
    .file__pick {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
      input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
      input:focus-visible + .btn {
        outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
        outline-offset: 2px;
      }
    }
    .file__name {
      overflow: hidden;
      color: var(--c-muted);
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error {
      color: var(--c-error);
      font-size: 0.875rem;
      font-weight: 500;
    }
  `,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)">
      <form class="dialog__form" (submit)="submit($event)">
        <header class="dialog__head">
          <div>
            <h2>{{ forceMajeure() ? 'Cancelar por fuerza mayor' : 'Cancelar contratación' }}</h2>
            <p>{{ counterpart() }} recibe una notificación con el motivo.</p>
          </div>
          <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </header>

        @switch (mode()) {
          @case ('late') {
            <p class="notice">
              <app-icon name="clock" [size]="18" />
              <span>
                Faltan 24 horas o menos para la cita, así que solo puedes cancelar por fuerza mayor.
                @if (canReschedule()) {
                  También puedes
                  <button type="button" class="notice__link" (click)="rescheduleInstead()">solicitar un nuevo horario</button>.
                }
              </span>
            </p>
          }
          @case ('in_progress') {
            <p class="notice">
              <app-icon name="triangle-alert" [size]="18" />
              <span>El servicio está en curso: solo se puede cancelar por fuerza mayor.</span>
            </p>
          }
          @default {
            <label class="toggle">
              <input type="checkbox" [checked]="forceMajeure()" (change)="chosenForceMajeure.set($any($event.target).checked)" />
              <span>
                Es una causa de fuerza mayor
                <small>Un administrador evalúa el caso. Puedes adjuntar una evidencia.</small>
              </span>
            </label>
          }
        }

        <label class="dialog__field">
          Motivo
          <textarea
            [placeholder]="'Cuéntale a ' + counterpartLower() + ' por qué cancelas.'"
            [maxLength]="maxReason"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
          <span class="dialog__hint">{{ reason().length }}/{{ maxReason }}</span>
        </label>

        @if (forceMajeure()) {
          <div class="file">
            Evidencia (opcional)
            <label class="file__pick">
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="pickFile($event)" />
              <span class="btn btn--ghost btn--sm"><app-icon name="upload" [size]="18" /> Adjuntar archivo</span>
              <span class="file__name">{{ fileName() ?? 'Ningún archivo' }}</span>
            </label>
            <span class="dialog__hint">JPG, PNG o PDF de máximo {{ maxFileMb }} MB.</span>
            @if (fileError()) {
              <span class="error" role="alert">{{ fileError() }}</span>
            }
          </div>
        }

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
          <button type="submit" class="btn btn--danger btn--sm" [disabled]="!reason().trim() || fileError()">
            Cancelar contratación
          </button>
        </footer>
      </form>
    </dialog>
  `,
})

export class CancelDialog {
  readonly confirmed = output<CancelRequest>();
  readonly reschedule = output<void>();

  protected readonly maxReason = MAX_REASON;
  protected readonly maxFileMb = MAX_FILE_MB;

  protected readonly mode = signal<CancelMode>('ordinary');
  protected readonly counterpart = signal('El cliente');
  protected readonly counterpartLower = computed(() =>
    this.counterpart().startsWith('El ') ? 'el' + this.counterpart().slice(2) : this.counterpart(),
  );
  protected readonly canReschedule = signal(false);
  protected readonly reason = signal('');
  protected readonly chosenForceMajeure = signal(false);
  private readonly evidence = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly fileName = computed(() => this.evidence()?.name ?? null);

  protected readonly forceMajeure = computed(() => this.mode() !== 'ordinary' || this.chosenForceMajeure());

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(mode: CancelMode, canReschedule: boolean, counterpart = 'El cliente'): void {
    this.counterpart.set(counterpart);
    this.mode.set(mode);
    this.canReschedule.set(canReschedule);
    this.reason.set('');
    this.chosenForceMajeure.set(false);
    this.evidence.set(null);
    this.fileError.set(null);
    this.dialog().nativeElement.showModal();
  }

  protected pickFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.evidence.set(file);
    this.fileError.set(
      !file
        ? null
        : !FILE_TYPES.includes(file.type)
          ? 'El archivo debe ser JPG, PNG o PDF.'
          : file.size > MAX_FILE_MB * 1024 * 1024
            ? `El archivo supera los ${MAX_FILE_MB} MB.`
            : null,
    );
  }

  protected rescheduleInstead(): void {
    this.close();
    this.reschedule.emit();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.confirmed.emit({
      reason: this.reason().trim(),
      forceMajeure: this.forceMajeure(),
      evidence: this.forceMajeure() ? this.evidence() : null,
    });
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
