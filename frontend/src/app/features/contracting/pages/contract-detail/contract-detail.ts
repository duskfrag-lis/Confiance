import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { BankAccount } from '../../../profiles/models/profiles.models';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import { ReasonDialog } from '../../components/reason-dialog/reason-dialog';
import {
  Actor,
  Contract,
  ContractAction,
  LATE_CANCEL_MS,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  activeDeadline,
  bankInfoVisibleToClient,
  can,
  paymentStatus,
  pendingReschedule,
  reschedulesLeft,
} from '../../models/contract';
import { ContractsService } from '../../services/contracts.service';

const PAYMENT_LABEL = {
  pending: 'Pendiente de pago',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

const ERRORS: Record<string, string> = {
  REQUEST_STATE: 'Esta contratación cambió de estado. La actualizamos.',
  SLOT_TAKEN: 'Ya tienes otra contratación aceptada en ese día y franja: no puedes aceptar esta.',
  PAST_DATE: 'La fecha de la contratación ya pasó.',
};

/** HU-38 · Detalle de una contratación vista por el prestador; responde la solicitud (HU-36). */
@Component({
  selector: 'app-contract-detail',
  imports: [RouterLink, Avatar, Icon, ContractProgress, ReasonDialog],
  templateUrl: './contract-detail.html',
  styleUrl: './contract-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractDetail {
  readonly id = input.required<string>();

  private readonly contracts = inject(ContractsService);
  private readonly clock = inject(ClockService);

  private readonly reasonDialog = viewChild(ReasonDialog);

  protected readonly contract = signal<Contract | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly flash = signal<string | null>(null);
  protected readonly bank = signal<BankAccount | null>(null);

  protected readonly firstName = computed(() => this.contract()?.client.name.split(' ')[0] ?? '');

  protected readonly deadline = computed(() => {
    const c = this.contract();
    const d = c && activeDeadline(c);
    if (!d) return null;
    return { ...d, left: formatDuration(d.at.getTime() - this.clock.now()) };
  });

  protected readonly isLate = computed(() => {
    const c = this.contract();
    return !!c && c.scheduledAt.getTime() - this.clock.now() < LATE_CANCEL_MS;
  });

  protected readonly payment = computed(() => {
    const c = this.contract();
    if (!c || (c.status !== 'finalizado' && c.status !== 'completado')) return null;
    const status = paymentStatus(c);
    return {
      status,
      label: PAYMENT_LABEL[status],
      settled: c.payments.find((p) => p.status === 'paid' || p.status === 'pending_confirmation') ?? null,
      rejected: c.payments.filter((p) => p.status === 'rejected'),
    };
  });

  protected readonly reschedule = computed(() => {
    const c = this.contract();
    return c ? { pending: pendingReschedule(c), left: reschedulesLeft(c) } : null;
  });

  protected readonly bankVisible = computed(() => {
    const c = this.contract();
    return !!c && bankInfoVisibleToClient(c.status);
  });

  protected readonly showBank = computed(() => {
    const s = this.contract()?.status;
    return !!s && s !== 'rechazado' && s !== 'cancelado';
  });

  protected readonly chatReadOnly = computed(() => {
    const s = this.contract()?.status;
    return s === 'rechazado' || s === 'cancelado' || s === 'completado';
  });

  protected readonly events = computed(() => [...(this.contract()?.events ?? [])].reverse());

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;
  protected readonly cop = formatCop;
  protected readonly longDate = formatLongDateTime;
  protected readonly shortDate = formatShortDateTime;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    inject(ProfilesService)
      .getBankAccount()
      .subscribe({ next: (b) => this.bank.set(b), error: () => undefined });
  }

  protected load(id = this.id()): void {
    this.contracts.providerDetail(id).subscribe({
      next: (c) => {
        this.contract.set(c);
        this.state.set('ready');
      },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.status === 400 ? 'not-found' : 'error'),
    });
  }

  protected can(action: ContractAction): boolean {
    const c = this.contract();
    return !!c && can(c, action);
  }

  protected actorName(actor: Actor, c: Contract): string {
    return actor === 'provider' ? 'Tú' : actor === 'client' ? c.client.name : 'Sistema';
  }

  protected maskedNumber(numero: string): string {
    return `•••• ${numero.slice(-4)}`;
  }

  protected accept(): void {
    this.run(this.contracts.accept(this.id()), 'Aceptaste la solicitud. Tu horario quedó reservado.');
  }

  protected openReject(): void {
    this.reasonDialog()?.open({
      title: 'Rechazar solicitud',
      subtitle: `${this.firstName()} recibe una notificación con tu respuesta.`,
      label: 'Motivo',
      placeholder: 'Por ejemplo: no tengo disponibilidad ese día.',
      maxLength: 300,
      required: false,
      confirmText: 'Rechazar solicitud',
      danger: true,
    });
  }

  protected onReject(reason: string): void {
    this.run(this.contracts.reject(this.id(), reason.trim()), 'Rechazaste la solicitud.');
  }

  /** Hace la acción y recarga el detalle, que trae el estado, las etapas y las acciones nuevas. */
  private run(request: Observable<unknown>, done: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.flash.set(null);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.flash.set(done);
        this.load();
      },
      error: (e) => {
        const code = apiErrorCode(e) ?? '';
        this.actionError.set(ERRORS[code] ?? 'No pudimos completar la acción. Inténtalo de nuevo.');
        if (code === 'REQUEST_STATE') this.load();
      },
    });
  }
}
