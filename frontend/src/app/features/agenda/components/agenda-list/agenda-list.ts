import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { APPOINTMENT_STATE_LABEL, Appointment, BLOCK_LABEL } from '../../models/appointment.models';
import { counterpartOf, dayTitle, groupByDay, timeOf } from '../../utils/agenda-dates';

/** Vista de lista de la agenda (HU-41.1): citas agrupadas por día, de la más próxima a la más lejana. */
@Component({
  selector: 'app-agenda-list',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './agenda-list.html',
  styleUrls: ['../../_tones.scss', './agenda-list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaList {
  readonly appointments = input.required<Appointment[]>();
  readonly home = input.required<string>();

  protected readonly stateLabel = APPOINTMENT_STATE_LABEL;
  protected readonly blockLabel = BLOCK_LABEL;
  protected readonly time = timeOf;
  protected readonly dayTitle = dayTitle;
  protected readonly counterpart = counterpartOf;

  protected readonly groups = computed(() => [...groupByDay(this.appointments())].map(([key, items]) => ({ key, items })));

  protected contractLink(a: Appointment): string[] {
    return [`${this.home()}/contrataciones`, a.contratacionId];
  }
}
