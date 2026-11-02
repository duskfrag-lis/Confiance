import { ChangeDetectionStrategy, Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-photo-viewer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .viewer {
      width: min(920px, calc(100vw - 2rem));
      padding: 0;
      overflow: hidden;
      border: 0;
      border-radius: 18px;
      background: var(--c-surface-2);
      color: var(--c-text);

      &[open] {
        animation: fade-up var(--dur) var(--ease-out);
      }
      &::backdrop {
        background: color-mix(in srgb, var(--c-text) 70%, transparent);
        animation: fade-in var(--dur) var(--ease-out);
      }
    }
    .stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: min(68vh, 560px);
      background: var(--c-text);

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        animation: fade-in var(--dur) var(--ease-out);
      }
    }
    .nav,
    .close {
      position: absolute;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: color-mix(in srgb, var(--c-white) 88%, transparent);
      color: var(--c-text);
      cursor: pointer;
      transition: transform var(--dur-fast) var(--ease-out);

      &:hover {
        transform: scale(1.06);
      }
      &:focus-visible {
        outline: 3px solid var(--c-primary);
        outline-offset: 2px;
      }
    }
    .nav {
      top: 50%;
      translate: 0 -50%;
      &--prev {
        left: 0.75rem;
      }
      &--next {
        right: 0.75rem;
      }
    }
    .close {
      top: 0.75rem;
      right: 0.75rem;
    }
    .caption {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;

      p {
        line-height: 1.55;
      }
      span {
        flex: none;
        color: var(--c-muted);
        font-size: 0.875rem;
      }
    }
  `,
  template: `
    <dialog #dialog class="viewer" (click)="onBackdrop($event)" (keydown)="onKey($event)" aria-label="Fotos del trabajo">
      @if (current(); as src) {
        <div class="stage">
          @for (s of [src]; track s) {
            <img [src]="s" [alt]="'Foto ' + (index() + 1) + ' de ' + photos().length" />
          }
          @if (photos().length > 1) {
            <button type="button" class="nav nav--prev" (click)="step(-1)" aria-label="Foto anterior"><app-icon name="caret-left" [size]="20" /></button>
            <button type="button" class="nav nav--next" (click)="step(1)" aria-label="Foto siguiente"><app-icon name="caret-right" [size]="20" /></button>
          }
          <button type="button" class="close" (click)="close()" aria-label="Cerrar"><app-icon name="x" [size]="18" /></button>
        </div>
        <div class="caption">
          <p>{{ caption() }}</p>
          @if (photos().length > 1) {
            <span>{{ index() + 1 }} / {{ photos().length }}</span>
          }
        </div>
      }
    </dialog>
  `,
})
export class PhotoViewer {
  protected readonly photos = signal<string[]>([]);
  protected readonly caption = signal('');
  protected readonly index = signal(0);
  protected readonly current = computed(() => this.photos()[this.index()] ?? null);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(photos: string[], caption: string, start = 0): void {
    this.photos.set(photos);
    this.caption.set(caption);
    this.index.set(start);
    this.dialog().nativeElement.showModal();
  }

  protected step(delta: number): void {
    const n = this.photos().length;
    this.index.update((i) => (i + delta + n) % n);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.step(-1);
    if (event.key === 'ArrowRight') this.step(1);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
