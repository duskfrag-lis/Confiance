import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { endSentence, formatCop, formatDuration, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { CancelDialog, CancelRequest } from '../../components/cancel-dialog/cancel-dialog';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import { PaymentDialog } from '../../components/payment-dialog/payment-dialog';
import { RatingDialog } from '../../components/rating-dialog/rating-dialog';
import { ReasonDialog } from '../../components/reason-dialog/reason-dialog';
import { RescheduleDialog } from '../../components/reschedule-dialog/reschedule-dialog';
import {
  Actor,
  ClientContract,
  ContractAction,
  LATE_CANCEL_MS,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  TimeBlock,
  activeDeadline,
  availabilityFrom,
  bankInfoVisibleToClient,
  can,
  paymentStatus,
  pendingReschedule,
  reschedulesLeft,
} from '../../models/contract';
import { ContractsService } from '../../services/contracts.service';
import { ChatService } from '../../../chat/services/chat.service';
import { ClaimDialog } from '../../../claims/components/claim-dialog/claim-dialog';
import { ClaimApi, STATE_LABEL as CLAIM_STATE_LABEL, isActive } from '../../../claims/models/claim.models';
import { ClaimsService } from '../../../claims/services/claims.service';
import { listTime } from '../../../chat/utils/chat-dates';
import { BackLink } from '../../../../shared/components/back-link/back-link';
import { CONTRACT_ERRORS, RELOAD_ON } from '../../models/contract-errors';

const PAYMENT_LABEL = {
  pending: 'Pendiente',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

const ERRORS: Record<string, string> = {
  ...CONTRACT_ERRORS,
  PAST_DATE: 'La fecha de la contratación ya pasó: no se puede confirmar.',
};


@Component({
  selector: 'app-client-contract-detail',
  imports: [BackLink, RouterLink, Avatar, Icon, ContractProgress, CancelDialog, RescheduleDialog, RatingDialog, PaymentDialog, ReasonDialog, ClaimDialog],
  templateUrl: './client-contract-detail.html',
  styleUrls: ['../contract-detail/contract-detail.scss', './client-contract-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientContractDetail {
  readonly id = input.required<string>();

  private readonly contracts = inject(ContractsService);
  private readonly chat = inject(ChatService);
  private readonly claimsService = inject(ClaimsService);
  private readonly claimDialog = viewChild(ClaimDialog);
  private readonly clock = inject(ClockService);
  private readonly profiles = inject(ProfilesService);

  private readonly cancelDialog = viewChild(CancelDialog);
  private readonly rescheduleDialog = viewChild(RescheduleDialog);
  private readonly ratingDialog = viewChild(RatingDialog);
  private readonly paymentDialog = viewChild(PaymentDialog);
  private readonly reasonDialog = viewChild(ReasonDialog);
  private availability: Record<number, TimeBlock[]> = {};

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

  protected readonly claimStateLabel = CLAIM_STATE_LABEL;
  protected readonly claims = computed(() => (this.claimsService.items() ?? []).filter((x) => x.contratacionId === this.id()));
  protected readonly myActiveClaim = computed(() => this.claims().some((x) => x.mio && isActive(x)));

  protected readonly conversation = computed(() => this.chat.conversations()?.find((x) => x.contratacionId === this.id()) ?? null);

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
  protected readonly endSentence = endSentence;
  protected readonly shortDate = formatShortDateTime;
  protected readonly chatTime = listTime;

  constructor() {
    this.chat.refresh();
    this.claimsService.refresh();
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
        if (!Object.keys(this.availability).length) {
          this.profiles.getPublicProfile(c.provider.profileId).subscribe({
            next: (p) => (this.availability = availabilityFrom(p.disponibilidad)),
            error: () => undefined,
          });
        }
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
    this.run(this.contracts.confirm(this.id()), 'Confirmaste la contratación. La cita ya está en tu agenda.');
  }

  protected confirmCompletion(): void {
    this.run(this.contracts.confirmCompletion(this.id()), 'Confirmaste que el trabajo quedó listo.');
  }

  protected openCancel(): void {
    const c = this.contract();
    if (!c) return;
    const mode = c.status === 'en_curso' ? 'in_progress' : this.can('cancelar') ? 'ordinary' : 'late';
    this.cancelDialog()?.open(mode, this.can('reagendar'), this.firstName());
  }

  protected onCancel(request: CancelRequest): void {
    this.run(
      this.contracts.cancel(this.id(), request.reason, request.forceMajeure, request.evidence),
      request.forceMajeure ? 'Cancelaste por fuerza mayor. Un administrador evaluará la causa.' : 'Cancelaste la contratación.',
    );
  }

  protected openReschedule(): void {
    const c = this.contract();
    if (!c) return;
    this.rescheduleDialog()?.open({
      current: c.scheduledAt,
      left: reschedulesLeft(c),
      counterpart: this.firstName(),
      availability: this.availability,
      isTaken: () => false,
    });
  }

  protected onReschedule(date: Date): void {
    this.run(this.contracts.reschedule(this.id(), date), `Propusiste un nuevo horario. ${this.firstName()} debe aceptarlo.`);
  }

  protected answerReschedule(accept: boolean): void {
    this.run(this.contracts.answerReschedule(this.id(), accept), accept ? 'Aceptaste el nuevo horario.' : 'Rechazaste el nuevo horario: la cita sigue igual.');
  }

  protected payPse(): void {
    const c = this.contract();
    if (c) this.paymentDialog()?.openPse(c.price, this.firstName(), () => this.contracts.payPse(c.id));
  }

  protected onPaymentClosed(): void {
    this.load();
  }

  protected payTransfer(): void {
    const c = this.contract();
    if (c?.bankAccount) this.paymentDialog()?.openTransfer(c.price, this.firstName(), c.bankAccount);
  }

  protected onTransferMarked(): void {
    this.run(this.contracts.markTransfer(this.id()), `Marcaste el pago por transferencia. ${this.firstName()} debe confirmar que la recibió.`);
  }

  protected openClaim(): void {
    const c = this.contract();
    if (c) this.claimDialog()?.open(c.id, { name: c.provider.name, photoUrl: c.provider.photoUrl }, c.service);
  }

  protected onClaimCreated(claim: ClaimApi): void {
    this.actionError.set(null);
    this.flash.set(`Creaste el reclamo #${claim.id}. Un administrador lo revisará y te avisaremos de cada cambio.`);
  }

  protected openReport(): void {
    this.reasonDialog()?.open({
      title: 'Reportar un problema',
      subtitle: 'Queda registrado en la contratación y la confirmación automática se suspende.',
      label: 'Qué pasó',
      placeholder: 'Describe el problema con el servicio.',
      maxLength: 1000,
      required: true,
      confirmText: 'Enviar reporte',
    });
  }

  protected onReport(text: string): void {
    this.run(this.contracts.report(this.id(), text.trim()), 'Reportaste el problema. Queda registrado en la contratación.');
  }

  protected openRating(): void {
    const c = this.contract();
    if (c) this.ratingDialog()?.open(c.provider.name);
  }

  protected onRating(r: { score: number; comment: string }): void {
    this.run(this.contracts.rate(this.id(), r.score, r.comment), `Calificaste a ${this.firstName()}. ¡Gracias!`);
  }

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
        if (RELOAD_ON.includes(code)) this.load();
      },
    });
  }
}
