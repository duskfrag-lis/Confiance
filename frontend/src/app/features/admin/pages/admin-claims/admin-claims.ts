import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { ClaimState, REASON_LABEL, STATE_LABEL } from '../../../claims/models/claim.models';
import { relativeTime } from '../../../notifications/utils/notification-view';
import { AdminClaim } from '../../models/admin.models';
import { AdminService } from '../../services/admin.service';

type Range = 'all' | 'today' | 'week' | 'month';

const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: 'all', label: 'Cualquier fecha', days: null },
  { id: 'today', label: 'Hoy', days: 1 },
  { id: 'week', label: 'Últimos 7 días', days: 7 },
  { id: 'month', label: 'Últimos 30 días', days: 30 },
];

const STATES: ClaimState[] = ['abierto', 'en_revision', 'informacion_solicitada', 'resuelto', 'cerrado'];

@Component({
  selector: 'app-admin-claims',
  imports: [RouterLink, Icon],
  templateUrl: './admin-claims.html',
  styleUrls: ['../../_admin.scss', './admin-claims.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClaimsPage {
  private readonly admin = inject(AdminService);

  protected readonly reasonLabel = REASON_LABEL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly ranges = RANGES;
  protected readonly when = relativeTime;

  protected readonly items = signal<AdminClaim[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly state = signal<ClaimState | null>(null);
  protected readonly range = signal<Range>('all');

  private readonly inRange = computed(() => {
    const days = RANGES.find((r) => r.id === this.range())!.days;
    const from = days ? Date.now() - days * 86_400_000 : 0;
    return (this.items() ?? []).filter((c) => new Date(c.creado).getTime() >= from);
  });

  protected readonly states = computed(() => {
    const list = this.inRange();
    return [
      { id: null, label: 'Todos', count: list.length },
      ...STATES.map((s) => ({ id: s, label: STATE_LABEL[s], count: list.filter((c) => c.estado === s).length })),
    ];
  });

  protected readonly visible = computed(() => {
    const s = this.state();
    return this.inRange().filter((c) => !s || c.estado === s);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.admin.claims().subscribe({ next: (list) => this.items.set(list), error: () => this.loadError.set(true) });
  }
}
