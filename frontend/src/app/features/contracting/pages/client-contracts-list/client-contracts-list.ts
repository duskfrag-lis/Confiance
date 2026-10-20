import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatShortDateTime } from '../../../../shared/utils/format';
import { ClientContract, ContractStatus, STATUS_LABEL, paymentStatus } from '../../models/contract';
import { ClientContractsService } from '../../services/client-contracts.service';
import { LATE_CANCEL_MS, activeDeadline, pendingReschedule } from '../../services/provider-contracts.service';

type Filter = 'todas' | 'activas' | 'por-cerrar' | 'completadas' | 'cerradas';

const FILTERS: { id: Filter; label: string; statuses: ContractStatus[] | null }[] = [
  { id: 'todas', label: 'Todas', statuses: null },
  { id: 'activas', label: 'Activas', statuses: ['solicitado', 'aceptado', 'confirmado', 'en_curso'] },
  { id: 'por-cerrar', label: 'Por pagar o confirmar', statuses: ['finalizado'] },
  { id: 'completadas', label: 'Completadas', statuses: ['completado'] },
  { id: 'cerradas', label: 'Canceladas y rechazadas', statuses: ['cancelado', 'rechazado'] },
];

interface Hint {
  icon: IconName;
  text: string;
  urgent: boolean;
}

@Component({
  selector: 'app-client-contracts-list',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './client-contracts-list.html',
  styleUrl: '../contracts-list/contracts-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientContractsList {
  readonly filtro = input<string>();

  private readonly router = inject(Router);
  private readonly clock = inject(ClockService);
  private readonly service = inject(ClientContractsService);

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

function hintFor(c: ClientContract, now: number): Hint | null {
  const deadline = activeDeadline(c);
  const left = deadline ? deadline.at.getTime() - now : 0;
  const first = c.provider.name.split(' ')[0];

  if (pendingReschedule(c)?.requestedBy === 'provider') {
    return { icon: 'calendar', text: `${first} propuso un nuevo horario`, urgent: true };
  }

  switch (c.status) {
    case 'solicitado':
      return { icon: 'clock', text: `Esperando respuesta de ${first} (${formatDuration(left)})`, urgent: false };
    case 'aceptado':
      return { icon: 'clock', text: `Confirma las condiciones en ${formatDuration(left)}`, urgent: true };
    case 'confirmado':
      return left < LATE_CANCEL_MS ? { icon: 'calendar-check', text: `La cita es en ${formatDuration(left)}`, urgent: true } : null;
    case 'en_curso':
      return { icon: 'wrench', text: `${first} está prestando el servicio`, urgent: false };
    case 'finalizado': {
      const pay = paymentStatus(c);
      if (pay === 'pending_confirmation') {
        return { icon: 'clock', text: `Esperando que ${first} confirme tu transferencia`, urgent: false };
      }
      const text =
        !c.clientCompletion && pay === 'pending'
          ? 'Confirma la finalización y paga el servicio'
          : !c.clientCompletion
            ? 'Confirma la finalización'
            : 'Paga el servicio';
      return { icon: 'money', text, urgent: true };
    }
    case 'completado':
      return c.myRating ? null : { icon: 'star', text: `Califica a ${first}`, urgent: false };
    default:
      return null;
  }
}
