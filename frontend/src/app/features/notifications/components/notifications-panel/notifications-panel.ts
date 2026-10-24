import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { InboxService } from '../../../../core/services/inbox.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { NotificationsService } from '../../services/notifications.service';
import { NotificationItem } from '../notification-item/notification-item';

const POLL_MS = 30_000;
const SHOWN = 6;

@Component({
  selector: 'app-notifications-panel',
  imports: [RouterLink, Icon, NotificationItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .bell {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--c-text);
      cursor: pointer;
      transition: background-color var(--dur-fast);
    }
    .bell:hover,
    .bell.is-open {
      background: var(--c-surface-3);
    }
    .bell:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .count {
      position: absolute;
      top: 4px;
      right: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border: 2px solid var(--c-surface-2);
      border-radius: 999px;
      background: var(--c-error);
      color: var(--c-white);
      font-size: 0.6875rem;
      font-weight: 700;
      animation: fade-in var(--dur) var(--ease-out);
    }
    .panel {
      position: absolute;
      top: calc(100% + 10px);
      right: -4px;
      z-index: 40;
      display: flex;
      flex-direction: column;
      width: 400px;
      max-height: min(560px, calc(100dvh - 100px));
      overflow: hidden;
      border: 1px solid var(--c-border);
      border-radius: 18px;
      background: var(--c-white);
      box-shadow: 0 24px 48px -20px color-mix(in srgb, var(--c-text) 35%, transparent);
      animation: fade-up var(--dur) var(--ease-out);
    }
    .panel__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.1rem 0.6rem;

      h2 {
        font-size: 1.0625rem;
        font-weight: 700;
      }
    }
    .text-btn {
      padding: 0.25rem 0.4rem;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--c-primary-dark);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .text-btn:hover {
      background: var(--c-primary-soft);
    }
    .panel__list {
      flex: 1;
      min-height: 0;
      margin: 0;
      padding: 0 0.4rem 0.4rem;
      overflow-y: auto;
      list-style: none;
    }
    .panel__empty {
      display: grid;
      justify-items: center;
      gap: 0.35rem;
      padding: 1.75rem 1.25rem 2rem;
      color: var(--c-muted);
      font-size: 0.9rem;
      text-align: center;

      span {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        margin-bottom: 0.3rem;
        border-radius: 14px;
        background: var(--c-success-bg);
        color: var(--c-success);
      }
      strong {
        color: var(--c-text);
      }
    }
    .panel__foot {
      display: block;
      padding: 0.85rem;
      border-top: 1px solid var(--c-surface-3);
      color: var(--c-primary-dark);
      font-size: 0.9rem;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      transition: background-color var(--dur-fast);
    }
    .panel__foot:hover {
      background: var(--c-surface-2);
    }
    @media (max-width: 640px) {
      .panel {
        position: fixed;
        top: 80px;
        right: 0.75rem;
        left: 0.75rem;
        width: auto;
      }
    }
  `,
  template: `
    <button
      type="button"
      class="bell"
      [class.is-open]="open()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'Notificaciones, ' + inbox.unreadNotifications() + ' sin leer'"
      (click)="toggle()"
    >
      <app-icon name="bell" [size]="22" />
      @if (inbox.unreadNotifications()) {
        <span class="count" aria-hidden="true">{{ inbox.unreadNotifications() > 99 ? '99+' : inbox.unreadNotifications() }}</span>
      }
    </button>

    @if (open()) {
      <div class="panel" role="dialog" aria-label="Notificaciones recientes">
        <div class="panel__head">
          <h2>Notificaciones</h2>
          @if (inbox.unreadNotifications()) {
            <button type="button" class="text-btn" (click)="service.readAll()">Marcar todas como leídas</button>
          }
        </div>
        @if (recent().length) {
          <ul class="panel__list">
            @for (n of recent(); track n.id) {
              <li><app-notification-item [n]="n" [compact]="true" (opened)="open.set(false)" /></li>
            }
          </ul>
        } @else {
          <div class="panel__empty">
            <span><app-icon name="circle-check" [size]="22" /></span>
            <strong>Estás al día</strong>
            Aquí verás las novedades de tus contrataciones.
          </div>
        }
        <a class="panel__foot" [routerLink]="user.home() + '/notificaciones'" (click)="open.set(false)">Ver todas las notificaciones</a>
      </div>
    }
  `,
})
export class NotificationsPanel {
  protected readonly service = inject(NotificationsService);
  protected readonly inbox = inject(InboxService);
  protected readonly user = inject(CurrentUserService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);

  protected readonly recent = computed(() => (this.service.items() ?? []).slice(0, SHOWN));

  constructor() {
    this.service.refresh();
    const timer = setInterval(() => this.service.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.service.refresh();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
