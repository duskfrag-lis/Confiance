import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { relativeTime } from '../../../notifications/utils/notification-view';
import { ClaimApi, REASON_LABEL, STATE_LABEL, isActive } from '../../models/claim.models';
import { ClaimsService } from '../../services/claims.service';

type Filter = 'all' | 'active' | 'closed';

@Component({
  selector: 'app-claims',
  imports: [RouterLink, Icon],
  templateUrl: './claims.html',
  styleUrl: './claims.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimsPage {
  protected readonly service = inject(ClaimsService);
  protected readonly session = inject(CurrentUserService);

  protected readonly reasonLabel = REASON_LABEL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly when = relativeTime;

  protected readonly filter = signal<Filter>('all');

  protected readonly filters = computed(() => {
    const list = this.service.items() ?? [];
    return [
      { id: 'all' as const, label: 'Todos', count: list.length },
      { id: 'active' as const, label: 'En curso', count: list.filter(isActive).length },
      { id: 'closed' as const, label: 'Cerrados', count: list.filter((c) => !isActive(c)).length },
    ];
  });

  protected readonly visible = computed(() => {
    const f = this.filter();
    return (this.service.items() ?? []).filter((c) => f === 'all' || (f === 'active') === isActive(c));
  });

  constructor() {
    this.service.refresh();
  }

  protected parties(c: ClaimApi): string {
    return c.mio ? `Presentado por ti contra ${c.contraparte.nombre}` : `${c.contraparte.nombre} lo presentó contra ti`;
  }
}
