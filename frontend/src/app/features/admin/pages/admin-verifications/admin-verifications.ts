import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { formatLongDateTime } from '../../../../shared/utils/format';
import { relativeTime } from '../../../notifications/utils/notification-view';
import { MAX_INFO } from '../../../verification/models/verification.models';
import { AdminVerification, VerificationDecision } from '../../models/admin.models';
import { AdminService } from '../../services/admin.service';

const DECISIONS: { id: VerificationDecision; label: string; hint: string; icon: IconName }[] = [
  { id: 'aprobada', label: 'Aprobar', hint: 'La insignia aparece en su perfil.', icon: 'circle-check' },
  { id: 'correccion', label: 'Pedir corrección', hint: 'Debe corregir algo y reenviar.', icon: 'triangle-alert' },
  { id: 'rechazada', label: 'Rechazar', hint: 'El documento no es válido.', icon: 'x-circle' },
];

const DONE: Record<VerificationDecision, string> = {
  aprobada: 'Aprobaste la verificación de',
  correccion: 'Pediste una corrección a',
  rechazada: 'Rechazaste la verificación de',
};

@Component({
  selector: 'app-admin-verifications',
  imports: [Avatar, Icon],
  templateUrl: './admin-verifications.html',
  styleUrls: ['../../_admin.scss', './admin-verifications.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVerificationsPage {
  private readonly admin = inject(AdminService);

  protected readonly decisions = DECISIONS;
  protected readonly maxReason = MAX_INFO;
  protected readonly when = relativeTime;
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));

  protected readonly items = signal<AdminVerification[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly decision = signal<VerificationDecision | null>(null);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly flash = signal<string | null>(null);
  protected readonly zoomed = signal<string | null>(null);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  protected readonly selected = computed<AdminVerification | null>(() => {
    const list = this.items() ?? [];
    return list.find((v) => v.id === this.selectedId()) ?? list[0] ?? null;
  });

  protected readonly needsReason = computed(() => !!this.decision() && this.decision() !== 'aprobada');
  protected readonly canSave = computed(() => !!this.decision() && (!this.needsReason() || !!this.reason().trim()) && !this.saving());

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.admin.verifications().subscribe({
      next: (list) => this.items.set(list),
      error: (err) =>
        this.loadError.set(
          err instanceof HttpErrorResponse && err.status === 403
            ? 'Tu cuenta no tiene permisos de administrador en el servidor (users.is_admin).'
            : 'No pudimos cargar las verificaciones.',
        ),
    });
  }

  protected select(v: AdminVerification): void {
    this.selectedId.set(v.id);
    this.decision.set(null);
    this.reason.set('');
    this.error.set(null);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const v = this.selected();
    const decision = this.decision();
    if (!v || !decision || !this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    this.admin
      .reviewVerification(v.id, decision, this.needsReason() ? this.reason().trim() : '')
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.flash.set(`${DONE[decision]} ${v.prestador.nombre}. Se le notificó el resultado.`);
          this.items.update((list) => (list ?? []).filter((x) => x.id !== v.id));
          this.selectedId.set(null);
          this.decision.set(null);
          this.reason.set('');
        },
        error: (err) => {
          if (apiErrorCode(err) === 'VERIFICATION_REVIEWED') {
            this.items.update((list) => (list ?? []).filter((x) => x.id !== v.id));
            this.flash.set(`Otro administrador ya revisó la solicitud de ${v.prestador.nombre}.`);
            return;
          }
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 403
              ? 'No puedes revisar esta solicitud (es la tuya o tu cuenta no es administradora).'
              : 'No pudimos guardar la decisión. Recarga e intenta de nuevo.',
          );
        },
      });
  }

  protected zoom(url: string): void {
    this.zoomed.set(url);
    this.viewer()?.nativeElement.showModal();
  }

  protected closeZoom(): void {
    this.viewer()?.nativeElement.close();
  }
}
