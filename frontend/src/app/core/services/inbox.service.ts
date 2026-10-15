import { Injectable, signal } from '@angular/core';

/**
 * Contadores de notificaciones y mensajes sin leer (HU-65, HU-39).
 * Temporal: valores de ejemplo hasta que existan los endpoints.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  readonly unreadNotifications = signal(2);
  readonly unreadMessages = signal(3);
}
