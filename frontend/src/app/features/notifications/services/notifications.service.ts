import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { InboxService } from '../../../core/services/inbox.service';
import { NotificationApi } from '../models/notification.models';

const api = `${environment.apiUrl}/notifications`;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly inbox = inject(InboxService);

  readonly items = signal<NotificationApi[] | null>(null);
  readonly loadError = signal(false);

  refresh(): void {
    this.http
      .get<ApiResponse<NotificationApi[]>>(`${api}/mine`)
      .pipe(unwrap())
      .subscribe({
        next: (list) => {
          this.loadError.set(false);
          this.set(list);
        },
        error: () => this.loadError.set(true),
      });
  }

  setRead(n: NotificationApi, read: boolean): void {
    if (n.leida === read) return;
    const before = this.items();
    this.set((before ?? []).map((x) => (x.id === n.id ? { ...x, leida: read } : x)));
    this.http.post(`${api}/${encodeURIComponent(n.id)}/read`, { leida: read }).subscribe({ error: () => before && this.set(before) });
  }

  readAll(): void {
    const before = this.items();
    this.set((before ?? []).map((x) => ({ ...x, leida: true })));
    this.http.post(`${api}/read-all`, {}).subscribe({ error: () => before && this.set(before) });
  }

  private set(list: NotificationApi[]): void {
    this.items.set(list);
    this.inbox.unreadNotifications.set(list.filter((n) => !n.leida).length);
  }
}
