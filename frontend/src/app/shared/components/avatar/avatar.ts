import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const TONES = ['primary', 'accent', 'success', 'warning'] as const;

@Component({

  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--size.px]': 'size()',
    '[attr.data-tone]': 'tone()',
  },

  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--size);
      height: var(--size);
      overflow: hidden;
      border-radius: 50%;
      font-size: calc(var(--size) * 0.38);
      font-weight: 600;
      line-height: 1;
      user-select: none;
    }
    :host([data-tone='primary']) {
      background: var(--c-primary-soft);
      color: var(--c-primary-dark);
    }
    :host([data-tone='accent']) {
      background: var(--c-accent-soft);
      color: var(--c-accent-dark);
    }
    :host([data-tone='success']) {
      background: var(--c-success-bg);
      color: var(--c-success);
    }
    :host([data-tone='warning']) {
      background: var(--c-warning-bg);
      color: var(--c-warning-dark);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  template: `
    @if (photoUrl() && !failed()) {
      <img [src]="photoUrl()" alt="" (error)="failed.set(true)" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  `,
})

export class Avatar {
  readonly name = input.required<string>();
  readonly photoUrl = input<string | null | undefined>(null);
  readonly size = input(44);

  protected readonly failed = signal(false);

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );

  protected readonly tone = computed(() => {
    
    const sum = [...this.name()].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return TONES[sum % TONES.length];
  });
}
