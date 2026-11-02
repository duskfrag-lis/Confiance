import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-back-link',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-left: -0.35rem;
      padding: 0.3rem 0.5rem 0.3rem 0.35rem;
      border-radius: 8px;
      color: var(--c-primary-dark);
      font-weight: 600;
      text-decoration: none;
      transition: background-color var(--dur-fast) var(--ease-out);
    }
    a:hover {
      background: var(--c-surface-3);
    }
    a:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    app-icon {
      transition: transform var(--dur-fast) var(--ease-out);
    }
    a:hover app-icon {
      transform: translateX(-2px);
    }
  `,
  template: `
    <a [routerLink]="to()" (click)="back($event)">
      <app-icon name="arrow-left" [size]="18" />
      {{ label() }}
    </a>
  `,
})
export class BackLink {
  readonly to = input.required<string | unknown[]>();
  readonly label = input('Volver');
  readonly history = input(false, { transform: booleanAttribute });

  private readonly location = inject(Location);

  protected back(event: MouseEvent): void {
    const cameFromApp = ((this.location.getState() as { navigationId?: number } | null)?.navigationId ?? 1) > 1;
    if (!this.history() || !cameFromApp || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    this.location.back();
  }
}
