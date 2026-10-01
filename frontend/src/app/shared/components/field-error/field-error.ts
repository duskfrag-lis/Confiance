import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-field-error',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field-error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0;
      color: var(--c-error);
      font-size: 0.875rem;
    }
  `,

  template: `
    @if (message(); as text) {
      <p class="field-error" role="alert">
        <app-icon name="triangle-alert" [size]="16" />
        <span>{{ text }}</span>
      </p>
    }
  `,
})
export class FieldError {
  readonly message = input<string | null>(null);
}
