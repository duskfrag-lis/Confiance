import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { CATEGORY_LABEL, NOTIFICATION_KIND, NotificationApi } from '../../models/notification.models';
import { NotificationsService } from '../../services/notifications.service';
import { notificationLink, relativeTime } from '../../utils/notification-view';

@Component({
  selector: 'app-notification-item',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-unread]': '!n().leida', '[class.is-compact]': 'compact()' },
  styles: `
    :host {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      border-radius: 14px;
      transition: background-color var(--dur-fast) var(--ease-out);
    }
    :host(:hover) {
      background: var(--c-surface-2);
    }
    .item {
      display: flex;
      gap: 0.9rem;
      min-width: 0;
      padding: 0.85rem 0.25rem 0.85rem 0.85rem;
      color: inherit;
      text-decoration: none;
      border-radius: 14px;
    }
    :host(.is-compact) .item {
      gap: 0.75rem;
      padding: 0.7rem 0.25rem 0.7rem 0.7rem;
    }
    .tile {
      display: grid;
      flex: none;
      place-items: center;
    }
    .tile[data-tone='primary'] {
      color: var(--c-primary-dark);
    }
    .tile[data-tone='accent'] {
      color: var(--c-accent-dark);
    }
    .tile[data-tone='success'] {
      color: var(--c-success);
    }
    .tile[data-tone='warning'] {
      color: var(--c-warning-dark);
    }
    .tile[data-tone='error'] {
      color: var(--c-error);
    }
    .body {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }
    .title {
      color: var(--c-text-soft);
      font-weight: 500;
    }
    :host(.is-unread) .title {
      color: var(--c-text);
      font-weight: 700;
    }
    .text {
      display: -webkit-box;
      overflow: hidden;
      color: var(--c-muted);
      font-size: 0.9rem;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    :host(.is-compact) .text {
      -webkit-line-clamp: 1;
      font-size: 0.85rem;
    }
    .meta {
      margin-top: 0.15rem;
      color: var(--c-muted);
      font-size: 0.8rem;
    }
    :host(.is-unread) .meta .when {
      color: var(--c-accent-dark);
      font-weight: 600;
    }
    .toggle {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-right: 0.35rem;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
    }
    .toggle:hover,
    .toggle:focus-visible {
      background: var(--c-white);
    }
    .dot {
      width: 10px;
      height: 10px;
      border: 2px solid var(--c-border);
      border-radius: 50%;
      transition:
        background-color var(--dur-fast) var(--ease-out),
        border-color var(--dur-fast) var(--ease-out),
        transform var(--dur-fast) var(--ease-out);
    }
    :host(.is-unread) .dot {
      border-color: var(--c-accent);
      background: var(--c-accent);
    }
    .toggle:hover .dot {
      transform: scale(1.25);
    }
    @media (hover: hover) {
      :host(:not(.is-unread)) .toggle {
        opacity: 0;
        transition: opacity var(--dur-fast) var(--ease-out);
      }
      :host(:not(.is-unread):hover) .toggle,
      :host(:not(.is-unread)) .toggle:focus-visible {
        opacity: 1;
      }
    }
  `,
  template: `
    <a class="item" [routerLink]="link()" (click)="open()">
      <span class="tile" [attr.data-tone]="kind().tone"><app-icon [name]="kind().icon" [size]="compact() ? 20 : 22" /></span>
      <span class="body">
        <span class="title">{{ n().titulo }}</span>
        <span class="text">{{ n().mensaje }}</span>
        <span class="meta">
          <span class="when">{{ when() }}</span>
          @if (!compact()) {
            · {{ category() }}
          }
        </span>
      </span>
    </a>
    <button
      type="button"
      class="toggle"
      [attr.aria-label]="n().leida ? 'Marcar como no leída' : 'Marcar como leída'"
      [attr.title]="n().leida ? 'Marcar como no leída' : 'Marcar como leída'"
      (click)="service.setRead(n(), !n().leida)"
    >
      <span class="dot"></span>
    </button>
  `,
})
export class NotificationItem {
  readonly n = input.required<NotificationApi>();
  readonly compact = input(false);
  readonly opened = output<void>();

  protected readonly service = inject(NotificationsService);
  private readonly session = inject(CurrentUserService);

  protected readonly kind = computed(() => NOTIFICATION_KIND[this.n().tipo]);
  protected readonly category = computed(() => CATEGORY_LABEL[this.kind().category]);
  protected readonly when = computed(() => relativeTime(this.n().fecha));
  protected readonly link = computed(() => notificationLink(this.n(), this.session.home()));

  protected open(): void {
    this.service.setRead(this.n(), true);
    this.opened.emit();
  }
}
