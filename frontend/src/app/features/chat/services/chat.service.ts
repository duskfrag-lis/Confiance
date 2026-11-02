import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { InboxService } from '../../../core/services/inbox.service';
import { ConversationApi, MessageApi, ThreadApi } from '../models/chat.models';

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly inbox = inject(InboxService);

  readonly conversations = signal<ConversationApi[] | null>(null);
  readonly loadError = signal(false);

  refresh(): void {
    this.http
      .get<ApiResponse<ConversationApi[]>>(`${api}/chats/mine`)
      .pipe(unwrap())
      .subscribe({
        next: (list) => {
          this.conversations.set(list);
          this.loadError.set(false);
          this.inbox.unreadMessages.set(list.reduce((t, c) => t + c.sinLeer, 0));
        },
        error: () => {
          this.loadError.set(true);
          this.inbox.unreadMessages.set(0);
        },
      });
  }

  thread(contractId: string): Observable<ThreadApi> {
    return this.http.get<ApiResponse<ThreadApi>>(`${api}/contracts/${contractId}/messages`).pipe(unwrap());
  }

  send(contractId: string, text: string): Observable<MessageApi> {
    return this.http
      .post<ApiResponse<MessageApi>>(`${api}/contracts/${contractId}/messages`, { texto: text })
      .pipe(unwrap(), tap(() => this.refresh()));
  }

  markRead(contractId: string): Observable<unknown> {
    return this.http.post(`${api}/contracts/${contractId}/messages/read`, {}).pipe(tap(() => this.refresh()));
  }
}
