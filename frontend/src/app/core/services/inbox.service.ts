import { Injectable, signal } from '@angular/core';

/**
 * Contadores de notificaciones y mensajes sin leer (HU-62, HU-42).
 * Las notificaciones son de ejemplo hasta la E15; los mensajes los actualiza el chat.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  readonly unreadNotifications = signal(2);
  readonly unreadMessages = signal(0);
}
