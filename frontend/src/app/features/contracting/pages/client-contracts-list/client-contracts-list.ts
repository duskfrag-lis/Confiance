import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClockService } from '../../../../core/services/clock.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { formatCop, formatDuration, formatShortDateTime } from '../../../../shared/utils/format';
import { ClientContract, ContractStatus, LATE_CANCEL_MS, STATUS_LABEL } from '../../models/contract';
import { ContractsService } from '../../services/contracts.service';

type Filter = 'all' | 'active' | 'closing' | 'completed' | 'closed';

const FILTERS: { id: Filter; param: string | null; label: string; statuses: ContractStatus[] | null }[] = [
  { id: 'all', param: null, label: 'Todas', statuses: null },
  { id: 'active', param: 'activas', label: 'Activas', statuses: ['solicitado', 'aceptado', 'confirmado', 'en_curso'] },
  { id: 'closing', param: 'por-cerrar', label: 'Por pagar o confirmar', statuses: ['finalizado'] },
  { id: 'completed', param: 'completadas', label: 'Completadas', statuses: ['completado'] },
  { id: 'closed', param: 'cerradas', label: 'Canceladas y rechazadas', statuses: ['cancelado', 'rechazado'] },
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
  readonly filterParam = input<string>(undefined, { alias: 'filtro' });

  private readonly router = inject(Router);
  private readonly clock = inject(ClockService);
  private readonly contracts = inject(ContractsService);

  protected readonly items = signal<ClientContract[] | null>(null);
  protected readonly loadError = signal(false);

  protected readonly filters = computed(() => {
    const all = this.items() ?? [];
    return FILTERS.map((f) => ({
      ...f,
      count: f.statuses ? all.filter((c) => f.statuses!.includes(c.status)).length : all.length,
    }));
  });

  protected readonly active = computed<Filter>(() => FILTERS.find((f) => f.param === this.filterParam())?.id ?? 'all');

  protected readonly rows = computed(() => {
    const statuses = FILTERS.find((f) => f.id === this.active())!.statuses;
    const now = this.clock.now();
    return (this.items() ?? [])
      .filter((c) => !statuses || statuses.includes(c.status))
      .map((c) => ({ contract: c, hint: hintFor(c, now) }));
  });

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly cop = formatCop;
  protected readonly dateTime = formatShortDateTime;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.contracts.clientList().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected select(id: Filter): void {
    const param = FILTERS.find((f) => f.id === id)!.param;
    this.router.navigate([], { queryParams: { filtro: param }, replaceUrl: true });
  }
}

function hintFor(c: ClientContract, now: number): Hint | null {
  const left = c.scheduledAt.getTime() - now;
  const first = c.provider.name.split(' ')[0];
  switch (c.status) {
    case 'solicitado':
      return { icon: 'clock', text: `Esperando la respuesta de ${first}`, urgent: false };
    case 'aceptado':
      return { icon: 'clock', text: 'Confirma las condiciones para generar la cita', urgent: true };
    case 'confirmado':
      return left > 0 && left < LATE_CANCEL_MS ? { icon: 'calendar-check', text: `La cita es en ${formatDuration(left)}`, urgent: true } : null;
    case 'en_curso':
      return { icon: 'wrench', text: `${first} está prestando el servicio`, urgent: false };
    case 'finalizado':
      return { icon: 'money', text: 'Confirma la finalización y paga el servicio', urgent: true };
    default:
      return null;
  }
}
