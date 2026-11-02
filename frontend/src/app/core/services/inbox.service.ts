import { Injectable, signal } from '@angular/core';

/** Contadores de notificaciones y mensajes sin leer (HU-62, HU-42); los actualizan sus servicios. */
@Injectable({ providedIn: 'root' })
export class InboxService {
  readonly unreadNotifications = signal(0);
  readonly unreadMessages = signal(0);
}
