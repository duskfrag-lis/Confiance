import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { formatLongDateTime, formatShortDate } from '../../../../shared/utils/format';
import { VerificationForm } from '../../components/verification-form/verification-form';
import { DocumentType, STATE_LABEL, VerificationApi, VerificationState } from '../../models/verification.models';
import { VerificationService } from '../../services/verification.service';

const STATUS: Record<VerificationState, { icon: IconName; title: string }> = {
  sin_enviar: { icon: 'shield-check', title: 'Verifica tu identidad' },
  pendiente: { icon: 'clock', title: 'Tu documento está en revisión' },
  aprobada: { icon: 'shield-check', title: 'Tu identidad está verificada' },
  rechazada: { icon: 'x-circle', title: 'Rechazaron tu verificación' },
  correccion: { icon: 'triangle-alert', title: 'Te piden una corrección' },
};

@Component({
  selector: 'app-verification',
  imports: [RouterLink, Avatar, Icon, VerificationForm],
  templateUrl: './verification.html',
  styleUrl: './verification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationPage {
  private readonly service = inject(VerificationService);
  protected readonly session = inject(CurrentUserService);

  protected readonly stateLabel = STATE_LABEL;
  protected readonly shortDate = formatShortDate;
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));

  protected readonly data = signal<VerificationApi | null>(null);
  protected readonly types = signal<DocumentType[]>([]);
  protected readonly loadError = signal(false);
  protected readonly justSent = signal(false);
  protected readonly showNumber = signal(false);

  protected readonly status = computed(() => STATUS[this.data()?.estado ?? 'sin_enviar']);
  protected readonly canSubmit = computed(() => {
    const s = this.data()?.estado;
    return s === 'sin_enviar' || s === 'rechazada' || s === 'correccion';
  });

  protected readonly maskedNumber = computed(() => {
    const n = this.data()?.actual?.numero ?? '';
    return this.showNumber() ? n : `•••• ${n.slice(-4)}`;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    forkJoin([this.service.mine(), this.service.documentTypes()]).subscribe({
      next: ([data, types]) => {
        this.data.set(data);
        this.types.set(types);
      },
      error: () => this.loadError.set(true),
    });
  }

  protected onSubmitted(data: VerificationApi): void {
    this.data.set(data);
    this.justSent.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
