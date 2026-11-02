import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { AdminSummary } from '../../models/admin.models';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, Icon],
  templateUrl: './admin-home.html',
  styleUrls: ['../../_admin.scss', './admin-home.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHomePage {
  private readonly admin = inject(AdminService);
  protected readonly session = inject(CurrentUserService);

  protected readonly summary = signal<AdminSummary | null>(null);
  protected readonly loadError = signal(false);

  protected readonly tiles = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const tiles: { count: number; label: string; one: string; many: string; hint: string; icon: IconName; tone: string; link: string }[] = [
      { count: s.reclamos, label: 'Reclamos', one: 'reclamo en curso', many: 'reclamos en curso', hint: 'Revisa y registra la resolución aplicada.', icon: 'file-text', tone: 'warning', link: '/admin/reclamos' },
      { count: s.verificaciones, label: 'Verificaciones', one: 'documento por revisar', many: 'documentos por revisar', hint: 'Aprueba, rechaza o pide una corrección.', icon: 'shield-check', tone: 'primary', link: '/admin/verificaciones' },
      { count: s.fuerzaMayor, label: 'Fuerza mayor', one: 'cancelación por evaluar', many: 'cancelaciones por evaluar', hint: 'Deja constancia de si la causa era válida.', icon: 'triangle-alert', tone: 'accent', link: '/admin/fuerza-mayor' },
    ];
    return tiles;
  });

  protected readonly pending = computed(() => this.tiles().reduce((t, x) => t + x.count, 0));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.admin.summary().subscribe({ next: (s) => this.summary.set(s), error: () => this.loadError.set(true) });
  }
}
