import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatTime } from '../../../../shared/utils/format';
import { NextAppointment } from '../../models/home.models';

const TZ = 'America/Bogota';
const dayNum = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric' });
const month = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, month: 'short' });
const weekday = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long' });

@Component({
  selector: 'app-next-appointment',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .card,
    .empty {
      height: 100%;
    }
    .card {
      display: grid;
      gap: 1rem;
      padding: 1.3rem 1.4rem;
      border-radius: 18px;
      background: var(--c-primary);
      color: var(--c-white);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .label {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: var(--c-accent);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .when {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .date {
      display: grid;
      flex: none;
      place-items: center;
      width: 64px;
      height: 68px;
      border-radius: 14px;
      background: var(--c-white);
      color: var(--c-primary-dark);
      line-height: 1;
    }
    .date strong {
      font-size: 1.75rem;
      font-weight: 800;
    }
    .date span {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .info {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }
    .service {
      font-size: 1.125rem;
      font-weight: 700;
    }
    .time {
      opacity: 0.9;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding-top: 0.9rem;
      border-top: 1px solid color-mix(in srgb, var(--c-white) 22%, transparent);
      font-size: 0.9rem;
    }
    .who p {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .who small {
      opacity: 0.8;
    }
    .open {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--c-white) 16%, transparent);
      color: var(--c-white);
      transition: background-color var(--dur-fast) var(--ease-out);
    }
    .open:hover {
      background: color-mix(in srgb, var(--c-white) 28%, transparent);
    }
    .more {
      font-size: 0.85rem;
      opacity: 0.85;
    }
    .empty {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 0.5rem;
      padding: 1.5rem 1.4rem;
      border: 1px solid var(--c-border);
      border-radius: 18px;
      background: var(--c-card);
      box-shadow: var(--shadow-card);
      color: var(--c-muted);
      text-align: center;
    }
    .empty app-icon {
      color: var(--c-primary-dark);
    }
    .empty strong {
      color: var(--c-text);
    }
  `,
  template: `
    @if (appointment(); as a) {
      <article class="card" aria-label="Tu próxima cita">
        <div class="head">
          <span class="label">{{ a.inProgress ? 'Servicio en curso' : 'Tu próxima cita' }}</span>
          @if (a.inProgress) {
            <span class="live"><app-icon name="play" [size]="12" /> Ahora</span>
          }
        </div>
        <div class="when">
          <span class="date" aria-hidden="true">
            <strong>{{ day() }}</strong>
            <span>{{ mon() }}</span>
          </span>
          <div class="info">
            <p class="service">{{ a.service }}</p>
            <p class="time">{{ weekdayLabel() }}, {{ time() }} · {{ a.place }}</p>
          </div>
        </div>
        <div class="who">
          <app-avatar [name]="a.counterpart.name" [photoUrl]="a.counterpart.photoUrl" [size]="36" />
          <p>
            <small>{{ role() }}</small>
            {{ a.counterpart.name }}
          </p>
          <a class="open" [routerLink]="a.link" aria-label="Ver la contratación"><app-icon name="arrow-right" [size]="18" /></a>
        </div>
        @if (more()) {
          <p class="more">Y {{ more() }} {{ more() === 1 ? 'cita más' : 'citas más' }} en los próximos 7 días.</p>
        }
      </article>
    } @else {
      <div class="empty">
        <app-icon name="calendar" [size]="32" />
        <strong>No tienes citas próximas</strong>
        <ng-content />
      </div>
    }
  `,
})
export class NextAppointmentCard {
  readonly appointment = input<NextAppointment | null>(null);
  readonly more = input(0);
  readonly role = input('Prestador');

  protected readonly day = computed(() => (this.appointment() ? dayNum.format(this.appointment()!.date) : ''));
  protected readonly mon = computed(() => (this.appointment() ? month.format(this.appointment()!.date).replace('.', '') : ''));
  protected readonly time = computed(() => (this.appointment() ? formatTime(this.appointment()!.date) : ''));
  protected readonly weekdayLabel = computed(() => {
    const a = this.appointment();
    if (!a) return '';
    const w = weekday.format(a.date);
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}
