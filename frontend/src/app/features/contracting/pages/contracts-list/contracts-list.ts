import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatShortDateTime } from '../../../../shared/utils/format';
import { Contract, ContractStatus, STATUS_LABEL, paymentStatus } from '../../models/contract';
import { LATE_CANCEL_MS, ProviderContractsService, activeDeadline, pendingReschedule } from '../../services/provider-contracts.service';

type Filter = 'todas' | 'por-responder' | 'activas' | 'por-cerrar' | 'completadas' | 'cerradas';

const FILTERS: { id: Filter; label: string; statuses: ContractStatus[] | null }[] = [
  { id: 'todas', label: 'Todas', statuses: null },
  { id: 'por-responder', label: 'Por responder', statuses: ['solicitado'] },
  { id: 'activas', label: 'Activas', statuses: ['aceptado', 'confirmado', 'en_curso'] },
  { id: 'por-cerrar', label: 'Por cerrar', statuses: ['finalizado'] },
  { id: 'completadas', label: 'Completadas', statuses: ['completado'] },
  { id: 'cerradas', label: 'Canceladas y rechazadas', statuses: ['cancelado', 'rechazado'] },
];

interface Hint {
  icon: IconName;
  text: string;
  urgent: boolean;
}

@Component({
  selector: 'app-contracts-list',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './contracts-list.html',
  styleUrl: './contracts-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractsList {
  readonly filtro = input<string>();

  private readonly router = inject(Router);
  private readonly clock = inject(ClockService);
  private readonly service = inject(ProviderContractsService);

  protected readonly filters = computed(() => {
    const all = this.service.contracts();
    return FILTERS.map((f) => ({
      ...f,
      count: f.statuses ? all.filter((c) => f.statuses!.includes(c.status)).length : all.length,
    }));
  });

  protected readonly active = computed<Filter>(() =>
    FILTERS.some((f) => f.id === this.filtro()) ? (this.filtro() as Filter) : 'todas',
  );

  protected readonly rows = computed(() => {
    const statuses = FILTERS.find((f) => f.id === this.active())!.statuses;
    const now = this.clock.now();
    return this.service
      .contracts()
      .filter((c) => !statuses || statuses.includes(c.status))
      .map((c) => ({ contract: c, hint: hintFor(c, now) }));
  });

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly cop = formatCop;
  protected readonly dateTime = formatShortDateTime;

  protected select(id: Filter): void {
    this.router.navigate([], { queryParams: { filtro: id === 'todas' ? null : id }, replaceUrl: true });
  }
}

function hintFor(c: Contract, now: number): Hint | null {
  const deadline = activeDeadline(c);
  const left = deadline ? deadline.at.getTime() - now : 0;

  if (pendingReschedule(c)?.requestedBy === 'client') {
    return { icon: 'calendar', text: 'El cliente propuso un nuevo horario', urgent: true };
  }

  switch (c.status) {
    case 'solicitado':
      return { icon: 'clock', text: `Responde en ${formatDuration(left)}`, urgent: true };
    case 'aceptado':
      return { icon: 'clock', text: `Esperando confirmación del cliente (${formatDuration(left)})`, urgent: false };
    case 'confirmado':
      return left < LATE_CANCEL_MS
        ? { icon: 'calendar-check', text: `La cita es en ${formatDuration(left)}`, urgent: true }
        : null;
    case 'en_curso':
      return { icon: 'flag', text: 'Márcalo como finalizado al terminar', urgent: false };
    case 'finalizado':
      return paymentStatus(c) === 'pending_confirmation'
        ? { icon: 'money', text: 'Confirma si recibiste la transferencia', urgent: true }
        : { icon: 'money', text: paymentStatus(c) === 'paid' ? 'Pagado, falta la confirmación del cliente' : 'Pendiente de pago', urgent: false };
    case 'completado':
      return c.myRating ? null : { icon: 'star', text: 'Califica al cliente', urgent: false };
    default:
      return null;
  }
}
