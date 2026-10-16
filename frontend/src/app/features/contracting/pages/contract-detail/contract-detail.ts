import { ChangeDetectionStrategy, Component, computed, inject, input, isDevMode, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { CancelDialog, CancelRequest } from '../../components/cancel-dialog/cancel-dialog';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import { RatingDialog } from '../../components/rating-dialog/rating-dialog';
import { ReasonDialog } from '../../components/reason-dialog/reason-dialog';
import { RescheduleDialog } from '../../components/reschedule-dialog/reschedule-dialog';
import {
  Actor,
  Contract,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  bankInfoVisibleToClient,
  paymentStatus,
} from '../../models/contract';
import {
  LATE_CANCEL_MS,
  ProviderContractsService,
  activeDeadline,
  blockOf,
  pendingReschedule,
  reachedStatus,
  reschedulesLeft,
} from '../../services/provider-contracts.service';

type PendingAction = 'reject' | 'report';

const PAYMENT_LABEL = {
  pending: 'Pendiente de pago',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

@Component({
  selector: 'app-contract-detail',
  imports: [RouterLink, Avatar, Icon, ContractProgress, ReasonDialog, CancelDialog, RescheduleDialog, RatingDialog],
  templateUrl: './contract-detail.html',
  styleUrl: './contract-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractDetail {
  readonly id = input.required<string>();

  protected readonly service = inject(ProviderContractsService);
  private readonly clock = inject(ClockService);

  private readonly reasonDialog = viewChild.required(ReasonDialog);
  private readonly cancelDialog = viewChild.required(CancelDialog);
  private readonly rescheduleDialog = viewChild.required(RescheduleDialog);
  private readonly ratingDialog = viewChild.required(RatingDialog);

  private pendingAction: PendingAction = 'reject';

  protected readonly demo = isDevMode();
  protected readonly contract = computed(() => this.service.get(this.id())());

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

  protected readonly reached = computed(() => {
    const c = this.contract();
    return c ? reachedStatus(c) : 'solicitado';
  });

  protected readonly payment = computed(() => {
    const c = this.contract();
    if (!c || (c.status !== 'finalizado' && c.status !== 'completado')) return null;
    const status = paymentStatus(c);
    const settled = c.payments.find((p) => p.status === 'paid' || p.status === 'pending_confirmation') ?? null;
    return {
      status,
      label: PAYMENT_LABEL[status],
      settled,
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

  protected readonly slotTaken = computed(() => {
    const c = this.contract();
    if (!c || c.status !== 'solicitado') return false;
    const block = blockOf(c.scheduledAt);
    return !!block && this.service.isSlotTaken(c.scheduledAt, block, c.id);
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

  protected readonly canReport = computed(() => {
    const c = this.contract();
    return !!c && (c.status === 'finalizado' || c.status === 'completado') && !c.issueReported;
  });

  protected readonly canClaim = computed(() => {
    const s = this.contract()?.status;
    return !!s && s !== 'solicitado' && s !== 'rechazado';
  });

  protected readonly events = computed(() => [...(this.contract()?.events ?? [])].reverse());

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;
  protected readonly cop = formatCop;
  protected readonly longDate = formatLongDateTime;
  protected readonly shortDate = formatShortDateTime;

  protected actorName(actor: Actor, c: Contract): string {
    return actor === 'provider' ? 'Tú' : actor === 'client' ? c.client.name : 'Sistema';
  }

  protected accept(): void {
    this.service.accept(this.id());
  }

  protected openReject(): void {
    this.pendingAction = 'reject';
    this.reasonDialog().open({
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

  protected openReport(): void {
    this.pendingAction = 'report';
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

  protected onReason(text: string): void {
    if (this.pendingAction === 'reject') this.service.reject(this.id(), text);
    else this.service.reportIssue(this.id());
  }

  protected openCancel(): void {
    const c = this.contract();
    if (!c) return;
    const mode = c.status === 'en_curso' ? 'in_progress' : this.isLate() ? 'late' : 'ordinary';
    this.cancelDialog().open(mode, this.canReschedule());
  }

  protected onCancel(request: CancelRequest): void {
    this.service.cancel(this.id(), request.reason, request.forceMajeure);
  }

  protected openReschedule(): void {
    const c = this.contract();
    const r = this.reschedule();
    if (c && r) this.rescheduleDialog().open(c.id, c.scheduledAt, r.left);
  }

  protected onReschedule(date: Date): void {
    this.service.requestReschedule(this.id(), date);
  }

  protected answerReschedule(accept: boolean): void {
    this.service.answerReschedule(this.id(), accept);
  }

  protected start(): void {
    this.service.start(this.id());
  }

  protected finish(): void {
    this.service.finish(this.id());
  }

  protected answerTransfer(received: boolean): void {
    this.service.answerTransfer(this.id(), received);
  }

  protected openRating(): void {
    const c = this.contract();
    if (c) this.ratingDialog().open(c.client.name);
  }

  protected onRating(r: { score: number; comment: string }): void {
    this.service.rate(this.id(), r.score, r.comment);
  }
}
