import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, map, switchMap, tap, timer } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatShortDateTime } from '../../../../shared/utils/format';
import { ContractCore, ContractParty, STATUS_LABEL } from '../../../contracting/models/contract';
import { ContractsService } from '../../../contracting/services/contracts.service';
import { MAX_MESSAGE_LENGTH, ThreadApi, isReadOnly } from '../../models/chat.models';
import { ChatService } from '../../services/chat.service';
import { dayLabel, keyOfDay, messageTime } from '../../utils/chat-dates';

interface Pending {
  id: string;
  text: string;
  at: Date;
  failed: boolean;
}

interface Entry {
  kind: 'msg' | 'event';
  id: string;
  at: Date;
  text: string;
  mine: boolean;
  pending?: Pending;
}

type Item =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'event'; id: string; text: string; time: string }
  | { kind: 'msg'; id: string; text: string; mine: boolean; time: string; first: boolean; last: boolean; seen: boolean; pending?: Pending };

const POLL_MS = 2500;
const GROUP_GAP_MS = 5 * 60_000;
const COUNTER_FROM = 1800;

const SUGGESTIONS = {
  client: ['Hola, ¿a qué hora llegas?', '¿Debo tener algún material listo?', 'Te comparto un detalle del lugar:'],
  provider: ['Hola, ya revisé tu solicitud.', '¿Me confirmas la dirección exacta?', 'Llego a la hora acordada.'],
};

const CLOSED_REASON: Record<string, string> = {
  completado: 'La contratación quedó completada.',
  cancelado: 'La contratación fue cancelada.',
  rechazado: 'La solicitud fue rechazada.',
};

@Component({
  selector: 'app-conversation',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './conversation.html',
  styleUrl: './conversation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationPage {
  readonly id = input.required<string>();

  private readonly chat = inject(ChatService);
  private readonly contracts = inject(ContractsService);
  private readonly session = inject(CurrentUserService);

  protected readonly cop = formatCop;
  protected readonly dateTime = formatShortDateTime;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly counterFrom = COUNTER_FROM;

  protected readonly contract = signal<{ core: ContractCore; counterpart: ContractParty } | null>(null);
  protected readonly thread = signal<ThreadApi | null>(null);
  protected readonly pending = signal<Pending[]>([]);
  protected readonly draft = signal('');
  protected readonly loadError = signal(false);
  protected readonly showJump = signal(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private stick = true;
  private forceScroll = true;
  private initial = true;
  private lastRead = '';

  protected readonly isProvider = computed(() => this.session.current()?.perfilActivo === 'provider');
  protected readonly base = computed(() => (this.isProvider() ? '/prestador' : '/cliente'));
  protected readonly firstName = computed(() => this.contract()?.counterpart.name.split(' ')[0] ?? '');
  protected readonly suggestions = computed(() => SUGGESTIONS[this.isProvider() ? 'provider' : 'client']);

  protected readonly readOnly = computed(() => {
    const status = this.contract()?.core.status;
    return !!this.thread()?.soloLectura || (!!status && isReadOnly(status));
  });

  protected readonly closedReason = computed(() => CLOSED_REASON[this.contract()?.core.status ?? ''] ?? 'La contratación está cerrada.');

  protected readonly canSend = computed(() => {
    const text = this.draft().trim();
    return !!text && text.length <= MAX_MESSAGE_LENGTH && !this.readOnly() && !!this.thread();
  });

  protected readonly items = computed<Item[]>(() => {
    const t = this.thread();
    if (!t) return [];
    const name = this.firstName();
    const me = this.isProvider() ? 'provider' : 'client';
    const entries: Entry[] = [
      ...t.mensajes.map((m) => ({ kind: 'msg' as const, id: m.id, at: new Date(m.fecha), text: m.texto, mine: m.mio })),
      ...this.pending().map((p) => ({ kind: 'msg' as const, id: p.id, at: p.at, text: p.text, mine: true, pending: p })),
      ...(this.contract()?.core.events ?? []).map((e, i) => ({
        kind: 'event' as const,
        id: `e${i}`,
        at: e.at,
        mine: false,
        text: e.actor === 'system' || e.actor === me ? e.label : `${name} ${e.label.charAt(0).toLowerCase()}${e.label.slice(1)}`,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    const seenUntil = t.leidoPorContraparte ? new Date(t.leidoPorContraparte).getTime() : 0;
    const lastMine = [...entries].reverse().find((e) => e.kind === 'msg' && e.mine && !e.pending);
    const sameGroup = (a: Entry | undefined, b: Entry | undefined) =>
      !!a && !!b && a.kind === 'msg' && b.kind === 'msg' && a.mine === b.mine &&
      Math.abs(a.at.getTime() - b.at.getTime()) < GROUP_GAP_MS && keyOfDay(a.at) === keyOfDay(b.at);

    const out: Item[] = [];
    let day = '';
    entries.forEach((e, i) => {
      const key = keyOfDay(e.at);
      if (key !== day) {
        day = key;
        out.push({ kind: 'day', id: `d${key}`, label: dayLabel(e.at) });
      }
      if (e.kind === 'event') {
        out.push({ kind: 'event', id: e.id, text: e.text, time: messageTime(e.at) });
        return;
      }
      out.push({
        kind: 'msg',
        id: e.id,
        text: e.text,
        mine: e.mine,
        time: messageTime(e.at),
        first: !sameGroup(entries[i - 1], e),
        last: !sameGroup(e, entries[i + 1]),
        seen: e === lastMine && e.at.getTime() <= seenUntil,
        pending: e.pending,
      });
    });
    return out;
  });

  constructor() {
    toObservable(this.id)
      .pipe(
        tap(() => this.reset()),
        switchMap((id) => this.detail(id).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((c) => this.contract.set(c));

    toObservable(this.id)
      .pipe(
        switchMap((id) =>
          timer(0, POLL_MS).pipe(
            switchMap(() =>
              this.chat.thread(id).pipe(
                catchError(() => {
                  if (!this.thread()) this.loadError.set(true);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((t) => this.onThread(t));

    let count = 0;
    effect(() => {
      const n = this.items().length + (this.thread()?.escribiendo ? 1 : 0);
      untracked(() => {
        if (n === count) return;
        const grew = n > count;
        count = n;
        requestAnimationFrame(() => this.afterChange(grew));
      });
    });
  }

  private reset(): void {
    this.contract.set(null);
    this.thread.set(null);
    this.pending.set([]);
    this.draft.set('');
    this.loadError.set(false);
    this.showJump.set(false);
    this.stick = true;
    this.forceScroll = true;
    this.initial = true;
    this.lastRead = '';
  }

  private detail(id: string): Observable<{ core: ContractCore; counterpart: ContractParty }> {
    return this.isProvider()
      ? this.contracts.providerDetail(id).pipe(map((c) => ({ core: c, counterpart: c.client })))
      : this.contracts.clientDetail(id).pipe(map((c) => ({ core: c, counterpart: c.provider })));
  }

  private onThread(t: ThreadApi): void {
    const prev = this.thread();
    if (prev && prev.mensajes.length === t.mensajes.length && prev.leidoPorContraparte === t.leidoPorContraparte && prev.escribiendo === t.escribiendo && prev.soloLectura === t.soloLectura) return;
    this.loadError.set(false);
    this.thread.set(t);
    const lastIncoming = [...t.mensajes].reverse().find((m) => !m.mio);
    if (lastIncoming && lastIncoming.id !== this.lastRead && document.visibilityState === 'visible') {
      this.lastRead = lastIncoming.id;
      this.chat.markRead(this.id()).subscribe({ error: () => (this.lastRead = '') });
    }
  }

  private afterChange(grew: boolean): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    if (this.forceScroll || this.stick) {
      el.scrollTo({ top: el.scrollHeight, behavior: this.initial ? 'auto' : 'smooth' });
      this.initial = false;
      this.forceScroll = false;
      this.showJump.set(false);
    } else if (grew) {
      this.showJump.set(true);
    }
  }

  protected onScroll(): void {
    const el = this.scroller()!.nativeElement;
    this.stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (this.stick) this.showJump.set(false);
  }

  protected jump(): void {
    const el = this.scroller()!.nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    this.showJump.set(false);
  }

  protected onInput(value: string): void {
    this.draft.set(value);
    this.grow();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.send();
  }

  protected suggest(text: string): void {
    this.draft.set(text);
    const el = this.composer()?.nativeElement;
    if (!el) return;
    el.value = text;
    el.focus();
    el.setSelectionRange(text.length, text.length);
    this.grow();
  }

  protected send(): void {
    if (!this.canSend()) return;
    const p: Pending = { id: `p${Date.now()}`, text: this.draft().trim(), at: new Date(), failed: false };
    this.pending.update((list) => [...list, p]);
    this.draft.set('');
    const el = this.composer()?.nativeElement;
    if (el) el.value = '';
    this.grow();
    this.forceScroll = true;
    this.deliver(p);
  }

  protected retry(p: Pending): void {
    this.pending.update((list) => list.map((x) => (x.id === p.id ? { ...x, failed: false } : x)));
    this.deliver(p);
  }

  protected discard(p: Pending): void {
    this.pending.update((list) => list.filter((x) => x.id !== p.id));
  }

  private deliver(p: Pending): void {
    const id = this.id();
    this.chat.send(id, p.text).subscribe({
      next: (m) => {
        this.pending.update((list) => list.filter((x) => x.id !== p.id));
        this.thread.update((t) => (t && !t.mensajes.some((x) => x.id === m.id) ? { ...t, mensajes: [...t.mensajes, m] } : t));
      },
      error: (err) => {
        if (apiErrorCode(err) === 'CHAT_READ_ONLY') {
          this.pending.update((list) => list.filter((x) => x.id !== p.id));
          this.thread.update((t) => (t ? { ...t, soloLectura: true } : t));
          this.detail(id).subscribe((c) => this.contract.set(c));
          return;
        }
        this.pending.update((list) => list.map((x) => (x.id === p.id ? { ...x, failed: true } : x)));
      },
    });
  }

  private grow(): void {
    const el = this.composer()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }
}
