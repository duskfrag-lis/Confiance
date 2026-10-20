import { ChangeDetectionStrategy, Component, computed, inject, input, isDevMode, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { CancelDialog, CancelRequest } from '../../components/cancel-dialog/cancel-dialog';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import { PaymentDialog } from '../../components/payment-dialog/payment-dialog';
import { RatingDialog } from '../../components/rating-dialog/rating-dialog';
import { ReasonDialog } from '../../components/reason-dialog/reason-dialog';
import { RescheduleDialog } from '../../components/reschedule-dialog/reschedule-dialog';
import { Actor, ClientContract, PAYMENT_METHOD_LABEL, STATUS_LABEL, bankInfoVisibleToClient, paymentStatus } from '../../models/contract';
import { ClientContractsService } from '../../services/client-contracts.service';
import {
  LATE_CANCEL_MS,
  activeDeadline,
  pendingReschedule,
  reachedStatus,
  reschedulesLeft,
} from '../../services/provider-contracts.service';

const PAYMENT_LABEL = {
  pending: 'Pendiente',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

@Component({
  selector: 'app-client-contract-detail',
  imports: [RouterLink, Avatar, Icon, ContractProgress, ReasonDialog, CancelDialog, RescheduleDialog, RatingDialog, PaymentDialog],
  templateUrl: './client-contract-detail.html',
  styleUrls: ['../contract-detail/contract-detail.scss', './client-contract-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientContractDetail {
  readonly id = input.required<string>();

  protected readonly service = inject(ClientContractsService);
  private readonly clock = inject(ClockService);

  private readonly reasonDialog = viewChild.required(ReasonDialog);
  private readonly cancelDialog = viewChild.required(CancelDialog);
  private readonly rescheduleDialog = viewChild.required(RescheduleDialog);
  private readonly ratingDialog = viewChild.required(RatingDialog);
  private readonly paymentDialog = viewChild.required(PaymentDialog);

  protected readonly demo = isDevMode();
  protected readonly contract = computed(() => this.service.get(this.id())());
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

  protected readonly reached = computed(() => {
    const c = this.contract();
    return c ? reachedStatus(c) : 'solicitado';
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

  protected readonly canReschedule = computed(() => {
    const c = this.contract();
    const r = this.reschedule();
    return !!c && !!r && (c.status === 'aceptado' || c.status === 'confirmado') && !r.pending && r.left > 0;
  });

  protected readonly canCancel = computed(() => {
    const s = this.contract()?.status;
    return s === 'solicitado' || s === 'aceptado' || s === 'confirmado' || s === 'en_curso';
  });

  protected readonly showBank = computed(() => {
    const c = this.contract();
    return !!c && bankInfoVisibleToClient(c.status);
  });

  protected readonly chatReadOnly = computed(() => {
    const s = this.contract()?.status;
    return s === 'rechazado' || s === 'cancelado' || s === 'completado';
  });

  protected readonly canReport = computed(() => {
    const c = this.contract();
    return !!c && (c.status === 'finalizado' || c.status === 'completado') && !c.issueReported;
  });

  protected readonly canClaim = computed(() => {
    const s = this.contract()?.status;
    return !!s && s !== 'solicitado' && s !== 'rechazado';
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

  protected actorName(actor: Actor, c: ClientContract): string {
    return actor === 'client' ? 'Tú' : actor === 'provider' ? c.provider.name : 'Sistema';
  }

  protected confirmConditions(): void {
    this.service.confirmConditions(this.id());
  }

  protected confirmCompletion(): void {
    this.service.confirmCompletion(this.id());
  }

  protected openCancel(): void {
    const c = this.contract();
    if (!c) return;
    const mode = c.status === 'en_curso' ? 'in_progress' : this.isLate() ? 'late' : 'ordinary';
    this.cancelDialog().open(mode, this.canReschedule(), this.firstName());
  }

  protected onCancel(request: CancelRequest): void {
    this.service.cancel(this.id(), request.reason, request.forceMajeure);
  }

  protected openReschedule(): void {
    const c = this.contract();
    const r = this.reschedule();
    if (!c || !r) return;
    this.rescheduleDialog().open({
      current: c.scheduledAt,
      left: r.left,
      counterpart: this.firstName(),
      availability: this.service.availabilityOf(c.provider.profileId),
      isTaken: (date, block) => this.service.isSlotTaken(c.provider.profileId, date, block, c.id),
    });
  }

  protected onReschedule(date: Date): void {
    this.service.requestReschedule(this.id(), date);
  }

  protected answerReschedule(accept: boolean): void {
    this.service.answerReschedule(this.id(), accept);
  }

  protected payPse(): void {
    const c = this.contract();
    if (c) this.paymentDialog().openPse(c.price, this.firstName(), () => this.service.payPse(c.id));
  }

  protected payTransfer(): void {
    const c = this.contract();
    if (c?.bankAccount) this.paymentDialog().openTransfer(c.price, this.firstName(), c.bankAccount);
  }

  protected onTransferMarked(): void {
    this.service.markTransfer(this.id());
  }

  protected openReport(): void {
    this.reasonDialog().open({
      title: 'Reportar un problema',
      subtitle: 'Queda registrado en la contratación con la fecha y la hora.',
      label: 'Qué pasó',
      placeholder: 'Describe el problema con el servicio.',
      maxLength: 1000,
      required: true,
      confirmText: 'Enviar reporte',
    });
  }

  protected onReport(): void {
    this.service.reportIssue(this.id());
  }

  protected openRating(): void {
    const c = this.contract();
    if (c) this.ratingDialog().open(c.provider.name);
  }

  protected onRating(r: { score: number; comment: string }): void {
    this.service.rate(this.id(), r.score, r.comment);
  }
}
