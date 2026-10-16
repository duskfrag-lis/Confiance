import { ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

const MAX_COMMENT = 300;
const LABELS = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];

@Component({
  selector: 'app-rating-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stars {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .star {
      padding: 0.2rem;
      border: 0;
      background: none;
      color: var(--c-border);
      font-size: 2.25rem;
      line-height: 1;
      cursor: pointer;
      transition: transform var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
      &.is-on {
        color: var(--c-accent);
      }
      &:hover {
        transform: scale(1.1);
      }
      &:focus-visible {
        outline: 2px solid var(--c-primary);
        border-radius: 6px;
      }
    }
    .score-label {
      margin-left: 0.5rem;
      color: var(--c-muted);
      font-weight: 600;
    }
  `,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)">
      <form class="dialog__form" (submit)="submit($event)">
        <header class="dialog__head">
          <div>
            <h2>Califica a {{ name() }}</h2>
            <p>Solo puedes calificar una vez por contratación.</p>
          </div>
          <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </header>

        <div class="stars" role="radiogroup" aria-label="Calificación">
          @for (s of [1, 2, 3, 4, 5]; track s) {
            <button
              type="button"
              class="star"
              role="radio"
              [class.is-on]="s <= (hover() || score())"
              [attr.aria-checked]="score() === s"
              [attr.aria-label]="s + (s === 1 ? ' estrella' : ' estrellas')"
              (mouseenter)="hover.set(s)"
              (mouseleave)="hover.set(0)"
              (click)="score.set(s)"
            >
              ★
            </button>
          }
          <span class="score-label">{{ labels[hover() || score()] }}</span>
        </div>

        <label class="dialog__field">
          Comentario (opcional)
          <textarea
            placeholder="¿Cómo fue trabajar con este cliente?"
            [maxLength]="maxComment"
            [value]="comment()"
            (input)="comment.set($any($event.target).value)"
          ></textarea>
          <span class="dialog__hint">{{ comment().length }}/{{ maxComment }}</span>
        </label>

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
          <button type="submit" class="btn btn--primary btn--sm" [disabled]="!score()">Publicar calificación</button>
        </footer>
      </form>
    </dialog>
  `,
})

export class RatingDialog {
  readonly confirmed = output<{ score: number; comment: string }>();

  protected readonly maxComment = MAX_COMMENT;
  protected readonly labels = LABELS;
  protected readonly name = signal('');
  protected readonly score = signal(0);
  protected readonly hover = signal(0);
  protected readonly comment = signal('');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(name: string): void {
    this.name.set(name);
    this.score.set(0);
    this.comment.set('');
    this.dialog().nativeElement.showModal();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.confirmed.emit({ score: this.score(), comment: this.comment().trim() });
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
