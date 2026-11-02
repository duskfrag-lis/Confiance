import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatShortDateTime } from '../../../../shared/utils/format';
import { STATUS_LABEL } from '../../../contracting/models/contract';
import { ConversationApi } from '../../models/chat.models';

const MAX_TABS = 4;

@Component({
  selector: 'app-thread-tabs',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      border-bottom: 1px solid var(--c-surface-3);
      background: var(--c-white);
    }
    nav {
      display: flex;
      gap: 0.5rem;
      padding: 0.6rem 1.25rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    nav::-webkit-scrollbar {
      display: none;
    }
    a {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 0.45rem;
      min-height: 36px;
      padding: 0 0.85rem;
      border: 1px solid var(--c-border);
      border-radius: 999px;
      color: var(--c-text-soft);
      font-size: 0.8125rem;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition:
        border-color var(--dur-fast) var(--ease-out),
        background-color var(--dur-fast) var(--ease-out);
    }
    a:hover {
      border-color: var(--c-primary);
    }
    a[aria-current='page'] {
      border-color: var(--c-primary);
      background: var(--c-primary-soft);
      color: var(--c-primary-dark);
    }
    a:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .svc {
      max-width: 11rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .when {
      color: var(--c-muted);
      font-weight: 500;
    }
    .unread {
      min-width: 18px;
      padding: 0 0.3rem;
      border-radius: 999px;
      background: var(--c-accent);
      color: var(--c-white);
      font-size: 0.6875rem;
      line-height: 18px;
      text-align: center;
    }
    .pick {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 1.25rem;
      color: var(--c-muted);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .select {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    select {
      width: 100%;
      height: 38px;
      padding: 0 2.2rem 0 0.85rem;
      border: 1px solid var(--c-border);
      border-radius: 10px;
      background: var(--c-white);
      color: var(--c-text);
      font: inherit;
      font-size: 0.875rem;
      appearance: none;
      cursor: pointer;
    }
    select:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      outline-offset: 2px;
    }
    .select app-icon {
      position: absolute;
      top: 50%;
      right: 0.75rem;
      color: var(--c-muted);
      pointer-events: none;
      transform: translateY(-50%);
    }
    .dot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--c-primary);
    }
    .dot[data-status='solicitado'] {
      background: var(--c-muted);
    }
    .dot[data-status='en_curso'] {
      background: var(--c-accent);
    }
    .dot[data-status='finalizado'] {
      background: var(--c-warning);
    }
    .dot[data-status='completado'] {
      background: var(--c-success);
    }
    .dot[data-status='rechazado'],
    .dot[data-status='cancelado'] {
      background: var(--c-error);
    }
  `,
  template: `
    @if (asList()) {
      <label class="pick">
        <span>{{ threads().length }} contrataciones</span>
        <span class="select">
          <select aria-label="Elegir contratación" (change)="go($any($event.target).value)">
            @for (t of threads(); track t.contratacionId) {
              <option [value]="t.contratacionId" [selected]="t.contratacionId === current()">
                {{ t.servicio }} · {{ when(t.fechaHora) }} · {{ statusLabel[t.estado] }}{{ t.sinLeer ? ' · ' + t.sinLeer + ' sin leer' : '' }}
              </option>
            }
          </select>
          <app-icon name="caret-down" [size]="16" />
        </span>
      </label>
    } @else {
      <nav aria-label="Contrataciones con esta persona">
        @for (t of threads(); track t.contratacionId) {
          <a
            [routerLink]="[base(), 'mensajes', t.contratacionId]"
            [attr.aria-current]="t.contratacionId === current() ? 'page' : null"
            [attr.title]="t.servicio + ' · ' + statusLabel[t.estado]"
          >
            <span class="dot" [attr.data-status]="t.estado" aria-hidden="true"></span>
            <span class="svc">{{ t.servicio }}</span>
            <span class="when">{{ when(t.fechaHora) }}</span>
            @if (t.sinLeer && t.contratacionId !== current()) {
              <span class="unread" [attr.aria-label]="t.sinLeer + ' sin leer'">{{ t.sinLeer }}</span>
            }
          </a>
        }
      </nav>
    }
  `,
})
export class ThreadTabs {
  readonly threads = input.required<ConversationApi[]>();
  readonly current = input.required<string>();
  readonly base = input.required<string>();

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly asList = computed(() => this.threads().length > MAX_TABS);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    afterRenderEffect(() => {
      this.current();
      this.host.nativeElement.querySelector('a[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  protected when(iso: string): string {
    return formatShortDateTime(new Date(iso));
  }

  protected go(id: string): void {
    this.router.navigate([this.base(), 'mensajes', id]);
  }
}
