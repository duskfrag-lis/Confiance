import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatShortDate } from '../../../../shared/utils/format';
import { PaymentRecord, PaymentState } from '../../models/contract-api.models';
import { ContractsService } from '../../services/contracts.service';

type Filter = 'all' | 'pending' | 'confirming' | 'paid';

const FILTERS: { id: Filter; label: string; states: PaymentState[] | null }[] = [
  { id: 'all', label: 'Todos', states: null },
  { id: 'pending', label: 'Pendientes', states: ['pendiente', 'en_proceso'] },
  { id: 'confirming', label: 'Por confirmar', states: ['pendiente_confirmacion'] },
  { id: 'paid', label: 'Pagados', states: ['pagado'] },
];

const STATE_LABEL: Record<PaymentState, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  pendiente_confirmacion: 'Por confirmar',
  pagado: 'Pagado',
};

const monthLabel = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

@Component({
  selector: 'app-payments',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './payments.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './payments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsPage {
  private readonly contracts = inject(ContractsService);
  protected readonly session = inject(CurrentUserService);

  protected readonly cop = formatCop;
  protected readonly date = formatShortDate;
  protected readonly stateLabel = STATE_LABEL;

  protected readonly items = signal<PaymentRecord[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly filter = signal<Filter>('all');

  protected readonly isProvider = computed(() => this.session.current()?.perfilActivo === 'provider');

  protected readonly totals = computed(() => {
    const list = this.items() ?? [];
    const sum = (states: PaymentState[]) => {
      const sel = list.filter((p) => states.includes(p.estado));
      return { count: sel.length, amount: sel.reduce((t, p) => t + p.monto, 0) };
    };
    return { paid: sum(['pagado']), pending: sum(['pendiente', 'en_proceso']), confirming: sum(['pendiente_confirmacion']) };
  });

  protected readonly filters = computed(() => {
    const list = this.items() ?? [];
    return FILTERS.map((f) => ({ ...f, count: f.states ? list.filter((p) => f.states!.includes(p.estado)).length : list.length }));
  });

  protected readonly groups = computed(() => {
    const states = FILTERS.find((f) => f.id === this.filter())!.states;
    const groups = new Map<string, PaymentRecord[]>();
    for (const p of this.items() ?? []) {
      if (states && !states.includes(p.estado)) continue;
      const label = monthLabel.format(new Date(p.fecha ?? p.finalizada));
      groups.set(label, [...(groups.get(label) ?? []), p]);
    }
    return [...groups].map(([month, items]) => ({ month: month.charAt(0).toUpperCase() + month.slice(1), items }));
  });

  protected readonly attention = computed(() => (this.isProvider() ? this.totals().confirming : this.totals().pending));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.contracts.payments().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected showAttention(): void {
    this.filter.set(this.isProvider() ? 'confirming' : 'pending');
  }

  protected link(p: PaymentRecord): string[] {
    return [`${this.session.home()}/contrataciones`, p.contratacionId];
  }

  protected hint(p: PaymentRecord): string {
    const provider = this.isProvider();
    switch (p.estado) {
      case 'pendiente':
        return provider ? 'Esperando el pago del cliente' : 'Págalo por PSE o transferencia';
      case 'en_proceso':
        return 'Pago PSE en proceso';
      case 'pendiente_confirmacion':
        return provider ? 'Confirma si recibiste la transferencia' : 'El prestador debe confirmar la transferencia';
      default:
        return p.fecha ? `Pagado el ${formatShortDate(p.fecha)}` : 'Pagado';
    }
  }
}
