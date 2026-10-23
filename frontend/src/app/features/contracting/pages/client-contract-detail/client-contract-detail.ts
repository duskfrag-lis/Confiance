import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import {
  Actor,
  ClientContract,
  ContractAction,
  LATE_CANCEL_MS,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  activeDeadline,
  bankInfoVisibleToClient,
  can,
  paymentStatus,
  pendingReschedule,
} from '../../models/contract';
import { ContractsService } from '../../services/contracts.service';

const PAYMENT_LABEL = {
  pending: 'Pendiente',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

const ERRORS: Record<string, string> = {
  REQUEST_STATE: 'Esta contratación cambió de estado. La actualizamos.',
  PAST_DATE: 'La fecha de la contratación ya pasó: no se puede confirmar.',
};


@Component({
  selector: 'app-client-contract-detail',
  imports: [RouterLink, Avatar, Icon, ContractProgress],
  templateUrl: './client-contract-detail.html',
  styleUrls: ['../contract-detail/contract-detail.scss', './client-contract-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientContractDetail {
  readonly id = input.required<string>();

  private readonly contracts = inject(ContractsService);
  private readonly clock = inject(ClockService);

  protected readonly contract = signal<ClientContract | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly flash = signal<string | null>((history.state as { flash?: string } | null)?.flash ?? null);

  protected readonly firstName = computed(() => this.contract()?.provider.name.split(' ')[0] ?? '');

  protected readonly deadline = computed(() => {
    const c = this.contract();
    const d = c && activeDeadline(c);
    return d ? { ...d, left: formatDuration(d.at.getTime() - this.clock.now()) } : null;
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

  protected readonly pendingReschedule = computed(() => {
    const c = this.contract();
    return c ? pendingReschedule(c) : null;
  });

  protected readonly showBank = computed(() => {
    const c = this.contract();
    return !!c && bankInfoVisibleToClient(c.status);
  });

  protected readonly chatReadOnly = computed(() => {
    const s = this.contract()?.status;
    return s === 'rechazado' || s === 'cancelado' || s === 'completado';
  });

  protected readonly result = computed(() => {
    const c = this.contract();
    if (!c) return null;
    switch (c.status) {
      case 'completado':
        return 'Completada y pagada';
      case 'rechazado':
        return 'Rechazada por el prestador';
      case 'cancelado':
        return c.cancellation?.kind === 'automatic' ? 'Cancelada por plazo vencido' : 'Cancelada';
      default:
        return 'En proceso';
    }
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
  }

  protected load(id = this.id()): void {
    this.contracts.clientDetail(id).subscribe({
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

  protected actorName(actor: Actor, c: ClientContract): string {
    return actor === 'client' ? 'Tú' : actor === 'provider' ? c.provider.name : 'Sistema';
  }

  protected confirmConditions(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.flash.set(null);
    this.contracts
      .confirm(this.id())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.flash.set('Confirmaste la contratación. La cita ya está en tu agenda.');
          this.load();
        },
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          this.actionError.set(ERRORS[code] ?? 'No pudimos confirmar la contratación. Inténtalo de nuevo.');
          if (code === 'REQUEST_STATE') this.load();
        },
      });
  }
}
