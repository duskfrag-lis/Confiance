import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-profile-preview',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: block;
      padding: 1.5rem;
      border-radius: 16px;
      background: var(--c-surface-2);
      color: var(--c-text);
      box-shadow: 0 24px 48px color-mix(in srgb, var(--c-text) 30%, transparent);
    }
    .head {
      display: flex;
      justify-content: space-between;
      font-size: 1.0625rem;
      font-weight: 600;
    }
    .bar {
      height: 8px;
      margin-top: 0.85rem;
      border-radius: 999px;
      background: var(--c-border);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--c-accent);
    }
    ul {
      display: grid;
      gap: 0.75rem;
      margin: 1.25rem 0 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    li app-icon {
      color: var(--c-success);
    }
    .is-pending,
    .is-pending app-icon {
      color: var(--c-muted);
    }
  `,
  template: `
    <div class="head">
      <span>Tu perfil</span>
      <span>{{ progress }}%</span>
    </div>
    <div class="bar"><span [style.width.%]="progress"></span></div>

    <ul>
      @for (s of steps; track s.label) {
        <li [class.is-pending]="!s.done">
          <app-icon [name]="s.done ? 'circle-check' : 'circle'" [size]="22" />
          {{ s.label }}
        </li>
      }
    </ul>
  `,
})

export class ProfilePreview {
  protected readonly steps = [
    { label: 'Oficios y descripción', done: true },
    { label: 'Zonas de atención', done: true },
    { label: 'Disponibilidad semanal', done: true },
    { label: 'Verificar identidad', done: false },
  ];

  protected readonly progress = Math.round(
    (this.steps.filter((s) => s.done).length / this.steps.length) * 100,
  );
}
