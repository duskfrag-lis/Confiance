import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { STATUS_LABEL } from '../../../contracting/models/contract';
import { ConversationApi } from '../../models/chat.models';
import { ChatService } from '../../services/chat.service';
import { listTime } from '../../utils/chat-dates';

type Filter = 'all' | 'unread' | 'closed';

const LIST_POLL_MS = 15_000;

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

@Component({
  selector: 'app-messages',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPage {
  protected readonly chat = inject(ChatService);
  private readonly session = inject(CurrentUserService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly time = listTime;

  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly threadOpen = signal(false);

  protected readonly isProvider = computed(() => this.session.current()?.perfilActivo === 'provider');
  protected readonly base = computed(() => (this.isProvider() ? '/prestador' : '/cliente'));

  protected readonly filters = computed(() => {
    const list = this.chat.conversations() ?? [];
    return [
      { id: 'all' as const, label: 'Todas', count: null },
      { id: 'unread' as const, label: 'Sin leer', count: list.filter((c) => c.sinLeer).length },
      { id: 'closed' as const, label: 'Cerradas', count: null },
    ];
  });

  protected readonly visible = computed(() => {
    const q = normalize(this.query().trim());
    const f = this.filter();
    return (this.chat.conversations() ?? []).filter(
      (c) =>
        (f === 'all' || (f === 'unread' ? c.sinLeer > 0 : c.soloLectura)) &&
        (!q || normalize(`${c.contraparte.nombre} ${c.servicio}`).includes(q)),
    );
  });

  constructor() {
    this.chat.refresh();
    const timer = setInterval(() => this.chat.refresh(), LIST_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected preview(c: ConversationApi): string {
    if (!c.ultimoMensaje) return c.soloLectura ? 'Sin mensajes' : 'Inicia la conversación';
    return (c.ultimoMensaje.mio ? 'Tú: ' : '') + c.ultimoMensaje.texto;
  }
}
