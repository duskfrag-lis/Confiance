import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

const HEIGHT = { sm: 36, md: 42, lg: 48 } as const;

@Component({
  selector: 'app-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--h.px]': 'height()',
    '[attr.data-tone]': 'tone()',
  },
  styles: `
    :host {
      display: inline-flex;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--h) * 0.24);
      color: var(--c-text);
      text-decoration: none;
      border-radius: 10px;
    }
    .brand:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 4px;
    }
    img {
      display: block;
      width: auto;
      height: var(--h);
      transition: transform var(--dur) var(--ease-out);
    }
    .brand:hover img {
      transform: rotate(-4deg) scale(1.04);
    }
    .word {
      display: var(--brand-word, inline);
      padding-top: calc(var(--h) * 0.08);
      font-size: calc(var(--h) * 0.56);
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    :host([data-tone='light']) .brand {
      color: var(--c-white);
    }
    :host([data-tone='light']) img {
      filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--c-text) 45%, transparent));
    }
    :host([data-tone='light']) .word {
      text-shadow: 0 1px 8px color-mix(in srgb, var(--c-text) 40%, transparent);
    }
    @media (prefers-reduced-motion: reduce) {
      img {
        transition: none;
      }
    }
  `,
  template: `
    <a class="brand" [routerLink]="link()" aria-label="Confiance, ir al inicio">
      <img src="images/logo.png" alt="" [height]="height()" />
      <span class="word">Confiance</span>
    </a>
  `,
})
export class Brand {
  readonly link = input<string>('/');
  readonly size = input<keyof typeof HEIGHT>('md');
  readonly tone = input<'dark' | 'light'>('dark');

  protected readonly height = computed(() => HEIGHT[this.size()]);
}
