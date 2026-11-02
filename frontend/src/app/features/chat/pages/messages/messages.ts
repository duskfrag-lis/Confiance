import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter as whereEvent } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { STATUS_LABEL } from '../../../contracting/models/contract';
import { ChatGroup, ConversationApi, groupByPerson } from '../../models/chat.models';
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
  imports: [RouterOutlet, RouterLink, Avatar, Icon],
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

  private readonly groups = computed(() => groupByPerson(this.chat.conversations() ?? []));

  protected readonly filters = computed(() => [
    { id: 'all' as const, label: 'Todas', count: null },
    { id: 'unread' as const, label: 'Sin leer', count: this.groups().filter((g) => g.sinLeer).length },
    { id: 'closed' as const, label: 'Cerradas', count: null },
  ]);

  protected readonly visible = computed(() => {
    const q = normalize(this.query().trim());
    const f = this.filter();
    return this.groups().filter(
      (g) =>
        (f === 'all' || (f === 'unread' ? g.sinLeer > 0 : g.soloLectura)) &&
        (!q || normalize(`${g.contraparte.nombre} ${g.threads.map((t) => t.servicio).join(' ')}`).includes(q)),
    );
  });

  private readonly router = inject(Router);
  private readonly openId = signal(this.currentId());

  constructor() {
    this.router.events
      .pipe(
        whereEvent((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.openId.set(this.currentId()));
    this.chat.refresh();
    const timer = setInterval(() => this.chat.refresh(), LIST_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected preview(c: ConversationApi): string {
    if (!c.ultimoMensaje) return c.soloLectura ? 'Sin mensajes' : 'Inicia la conversación';
    return (c.ultimoMensaje.mio ? 'Tú: ' : '') + c.ultimoMensaje.texto;
  }

  protected isOpen(g: ChatGroup): boolean {
    return g.threads.some((t) => t.contratacionId === this.openId());
  }

  private currentId(): string | null {
    return this.router.url.match(/\/mensajes\/(\d+)/)?.[1] ?? null;
  }
}
