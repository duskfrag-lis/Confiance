import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { PendingItem } from '../../models/home.models';

@Component({
  selector: 'app-pending-list',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .list {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 0.85rem 0;
      border-top: 1px solid var(--c-surface-3);
    }
    li:first-child .item {
      border-top: 0;
      padding-top: 0.2rem;
    }
    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 13px;
    }
    .icon[data-tone='accent'] {
      background: var(--c-accent-soft);
      color: var(--c-accent-dark);
    }
    .icon[data-tone='primary'] {
      background: var(--c-primary-soft);
      color: var(--c-primary-dark);
    }
    .icon[data-tone='success'] {
      background: var(--c-success-bg);
      color: var(--c-success);
    }
    .icon[data-tone='warning'] {
      background: var(--c-warning-bg);
      color: var(--c-warning-dark);
    }
    .body {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .title {
      font-weight: 600;
    }
    .detail {
      overflow: hidden;
      color: var(--c-muted);
      font-size: 0.9rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn {
      flex: none;
    }
    .done {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.9rem 1rem;
      border-radius: 12px;
      background: var(--c-success-bg);
      color: var(--c-success);
      font-weight: 600;
    }
    @media (max-width: 520px) {
      .item {
        flex-wrap: wrap;
      }
      .body {
        flex-basis: calc(100% - 60px);
      }
      .btn {
        margin-left: 56px;
      }
    }
  `,
  template: `
    @if (items().length) {
      <ul class="list">
        @for (p of items(); track p.id) {
          <li>
            <div class="item">
              <span class="icon" [attr.data-tone]="p.tone"><app-icon [name]="p.icon" [size]="20" /></span>
              <div class="body">
                <p class="title">{{ p.title }}</p>
                <p class="detail">{{ p.detail }}</p>
              </div>
              <a class="btn btn--outline btn--sm" [routerLink]="p.link">{{ p.cta }}</a>
            </div>
          </li>
        }
      </ul>
    } @else {
      <p class="done"><app-icon name="circle-check" [size]="20" /> {{ emptyText() }}</p>
    }
  `,
})
export class PendingList {
  readonly items = input.required<PendingItem[]>();
  readonly emptyText = input('Estás al día. No tienes nada pendiente.');
}
