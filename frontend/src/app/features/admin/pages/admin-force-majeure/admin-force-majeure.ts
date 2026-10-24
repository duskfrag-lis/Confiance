import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { STATUS_LABEL } from '../../../contracting/models/contract';
import { AdminForceMajeure } from '../../models/admin.models';
import { AdminService } from '../../services/admin.service';

type Decision = 'aprobada' | 'rechazada';

@Component({
  selector: 'app-admin-force-majeure',
  imports: [Icon],
  templateUrl: './admin-force-majeure.html',
  styleUrls: ['../../_admin.scss', './admin-force-majeure.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminForceMajeurePage {
  private readonly admin = inject(AdminService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly dateTime = (iso: string) => formatShortDateTime(new Date(iso));
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));

  protected readonly items = signal<AdminForceMajeure[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly confirming = signal<{ id: string; decision: Decision } | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly flash = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.admin.forceMajeure().subscribe({ next: (list) => this.items.set(list), error: () => this.loadError.set(true) });
  }

  protected ask(id: string, decision: Decision): void {
    this.confirming.set({ id, decision });
    this.error.set(null);
  }

  protected confirm(item: AdminForceMajeure): void {
    const c = this.confirming();
    if (!c || c.id !== item.contratacionId || this.saving()) return;
    this.saving.set(true);
    this.admin
      .reviewForceMajeure(item.contratacionId, c.decision)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.flash.set(
            `Marcaste como ${c.decision === 'aprobada' ? 'aprobada' : 'rechazada'} la fuerza mayor de la contratación #${item.contratacionId}. Se notificó a ${item.canceladoPor.nombre}.`,
          );
          this.items.update((list) => (list ?? []).filter((x) => x.contratacionId !== item.contratacionId));
          this.confirming.set(null);
        },
        error: () => this.error.set('No pudimos guardar la evaluación. Recarga e intenta de nuevo.'),
      });
  }
}
