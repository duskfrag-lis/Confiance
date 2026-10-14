import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { bogotaHour, formatCop, formatShortDateTime } from '../../../../shared/utils/format';
import { AppointmentStatus } from '../../models/provider-dashboard';
import { ProviderDashboardService } from '../../services/provider-dashboard.service';

type DayPart = 'morning' | 'afternoon' | 'night';

const GREETINGS: Record<DayPart, { hello: string; line: string }> = {
  morning: { hello: 'Buenos días', line: 'Un buen día empieza con un trabajo bien hecho.' },
  afternoon: { hello: 'Buenas tardes', line: 'Cada servicio que cumples suma a tu reputación.' },
  night: { hello: 'Buenas noches', line: 'Revisa tu agenda y prepárate para un gran día mañana.' },
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmado: 'Confirmado',
  en_curso: 'En curso',
};

@Component({
  selector: 'app-provider-home',
  imports: [RouterLink, Icon, Avatar],
  templateUrl: './provider-home.html',
  styleUrl: './provider-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ProviderHome {
  private readonly user = inject(CurrentUserService);

  protected readonly data = toSignal(inject(ProviderDashboardService).getDashboard());

  protected readonly greeting = computed(() => {
    const h = bogotaHour();
    const part: DayPart = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 19 ? 'afternoon' : 'night';
    return { ...GREETINGS[part], name: this.user.firstName() };
  });

  protected readonly profileProgress = computed(() => {
    const checks = this.data()?.profileChecks ?? [];
    return checks.length ? Math.round((checks.filter((c) => c.done).length / checks.length) * 100) : 0;
  });

  protected readonly identityPending = computed(
    () => this.data()?.profileChecks.some((c) => c.label === 'Identidad verificada' && !c.done) ?? false,
  );

  protected readonly cop = formatCop;
  protected readonly dateTime = formatShortDateTime;
  protected readonly statusLabel = STATUS_LABEL;
}
