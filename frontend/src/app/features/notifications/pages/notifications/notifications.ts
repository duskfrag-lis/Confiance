import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';
import { NotificationItem } from '../../components/notification-item/notification-item';
import { CATEGORY_LABEL, NOTIFICATION_KIND, NotificationApi, NotificationCategory } from '../../models/notification.models';
import { NotificationsService } from '../../services/notifications.service';
import { daysAgo } from '../../utils/notification-view';

const GROUPS = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'];

const groupOf = (n: NotificationApi): number => {
  const ago = daysAgo(new Date(n.fecha));
  return ago <= 0 ? 0 : ago === 1 ? 1 : ago < 7 ? 2 : 3;
};

@Component({
  selector: 'app-notifications',
  imports: [Icon, NotificationItem],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  protected readonly service = inject(NotificationsService);

  protected readonly category = signal<NotificationCategory | null>(null);
  protected readonly onlyUnread = signal(false);

  protected readonly unread = computed(() => (this.service.items() ?? []).filter((n) => !n.leida).length);

  protected readonly categories = computed(() => {
    const list = this.service.items() ?? [];
    const used = new Set(list.map((n) => NOTIFICATION_KIND[n.tipo].category));
    return (Object.keys(CATEGORY_LABEL) as NotificationCategory[])
      .filter((c) => used.has(c))
      .map((c) => ({
        id: c,
        label: CATEGORY_LABEL[c],
        unread: list.filter((n) => !n.leida && NOTIFICATION_KIND[n.tipo].category === c).length,
      }));
  });

  protected readonly groups = computed(() => {
    const cat = this.category();
    const out = GROUPS.map((label) => ({ label, items: [] as NotificationApi[] }));
    for (const n of this.service.items() ?? []) {
      if (this.onlyUnread() && n.leida) continue;
      if (cat && NOTIFICATION_KIND[n.tipo].category !== cat) continue;
      out[groupOf(n)].items.push(n);
    }
    return out.filter((g) => g.items.length);
  });

  constructor() {
    this.service.refresh();
  }
}
