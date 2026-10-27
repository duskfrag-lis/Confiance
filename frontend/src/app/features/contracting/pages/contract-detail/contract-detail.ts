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
import { CancelDialog, CancelRequest } from '../../components/cancel-dialog/cancel-dialog';
import { ContractProgress } from '../../components/contract-progress/contract-progress';
import { RatingDialog } from '../../components/rating-dialog/rating-dialog';
import { ReasonDialog } from '../../components/reason-dialog/reason-dialog';
import { RescheduleDialog } from '../../components/reschedule-dialog/reschedule-dialog';
import {
  Actor,
  Contract,
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

const PAYMENT_LABEL = {
  pending: 'Pendiente de pago',
  pending_confirmation: 'Por confirmar',
  paid: 'Pagado',
};

const ERRORS: Record<string, string> = {
  REQUEST_STATE: 'Esta contratación cambió de estado. La actualizamos.',
  SLOT_TAKEN: 'Ya tienes otra contratación aceptada en ese día y franja: no puedes aceptar esta.',
  PAST_DATE: 'La fecha de la contratación ya pasó.',
  CANCEL_NOTICE: 'Faltan 24 horas o menos para la cita: solo puedes cancelar por fuerza mayor.',
};

@Component({
  selector: 'app-contract-detail',
  imports: [RouterLink, Avatar, Icon, ContractProgress, ReasonDialog, CancelDialog, RescheduleDialog, RatingDialog, ClaimDialog],
  templateUrl: './contract-detail.html',
  styleUrl: './contract-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractDetail {
  readonly id = input.required<string>();

  private readonly contracts = inject(ContractsService);
  private readonly chat = inject(ChatService);
  private readonly claimsService = inject(ClaimsService);
  private readonly claimDialog = viewChild(ClaimDialog);
  private readonly clock = inject(ClockService);

  private readonly reasonDialog = viewChild(ReasonDialog);
  private readonly cancelDialog = viewChild(CancelDialog);
  private readonly rescheduleDialog = viewChild(RescheduleDialog);
  private readonly ratingDialog = viewChild(RatingDialog);
  private reasonFor: 'reject' | 'report' = 'reject';
  private availability: Record<number, TimeBlock[]> = {};

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

  protected readonly claimStateLabel = CLAIM_STATE_LABEL;
  protected readonly claims = computed(() => (this.claimsService.items() ?? []).filter((x) => x.contratacionId === this.id()));
  protected readonly myActiveClaim = computed(() => this.claims().some((x) => x.mio && isActive(x)));

  protected readonly conversation = computed(() => this.chat.conversations()?.find((x) => x.contratacionId === this.id()) ?? null);

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
  protected readonly chatTime = listTime;

  constructor() {
    this.chat.refresh();
    this.claimsService.refresh();
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    const profiles = inject(ProfilesService);
    profiles.getBankAccount().subscribe({ next: (b) => this.bank.set(b), error: () => undefined });
    profiles.getProvider().subscribe({ next: (p) => (this.availability = availabilityFrom(p.disponibilidad)), error: () => undefined });
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
    this.reasonFor = 'reject';
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

  protected onReason(text: string): void {
    if (this.reasonFor === 'reject') this.run(this.contracts.reject(this.id(), text.trim()), 'Rechazaste la solicitud.');
    else this.run(this.contracts.report(this.id(), text.trim()), 'Reportaste el problema. Queda registrado en la contratación.');
  }

  protected start(): void {
    this.run(this.contracts.start(this.id()), 'Iniciaste el servicio.');
  }

  protected finish(): void {
    this.run(this.contracts.finish(this.id()), `Marcaste el servicio como finalizado. ${this.firstName()} debe confirmarlo y pagar.`);
  }

  protected openClaim(): void {
    const c = this.contract();
    if (c) this.claimDialog()?.open(c.id, { name: c.client.name, photoUrl: c.client.photoUrl }, c.service);
  }

  protected onClaimCreated(claim: ClaimApi): void {
    this.actionError.set(null);
    this.flash.set(`Creaste el reclamo #${claim.id}. Un administrador lo revisará y te avisaremos de cada cambio.`);
  }

  protected openReport(): void {
    this.reasonFor = 'report';
    this.reasonDialog()?.open({
      title: 'Reportar un problema',
      subtitle: 'Queda registrado en la contratación con la fecha y la hora.',
      label: 'Qué pasó',
      placeholder: 'Describe el problema con el servicio.',
      maxLength: 1000,
      required: true,
      confirmText: 'Enviar reporte',
    });
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
    const r = this.reschedule();
    if (!c || !r) return;
    this.rescheduleDialog()?.open({
      current: c.scheduledAt,
      left: r.left,
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

  protected answerTransfer(received: boolean): void {
    this.run(
      this.contracts.confirmTransfer(this.id(), received),
      received ? 'Confirmaste que recibiste la transferencia.' : `Avisamos a ${this.firstName()} que la transferencia no llegó.`,
    );
  }

  protected openRating(): void {
    const c = this.contract();
    if (c) this.ratingDialog()?.open(c.client.name);
  }

  protected onRating(r: { score: number; comment: string }): void {
    this.run(this.contracts.rate(this.id(), r.score, r.comment), `Calificaste a ${this.firstName()}. ¡Gracias!`);
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
