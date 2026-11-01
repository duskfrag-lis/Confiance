import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatLongDateTime, formatShortDateTime } from '../../../../shared/utils/format';
import { CLAIM_TRANSITIONS, ClaimState, MAX_DESCRIPTION, REASON_LABEL, STATE_LABEL } from '../../../claims/models/claim.models';
import { STATUS_LABEL } from '../../../contracting/models/contract';
import { AdminClaimDetail } from '../../models/admin.models';
import { AdminService } from '../../services/admin.service';
import { BackLink } from '../../../../shared/components/back-link/back-link';

const HINT: Partial<Record<ClaimState, string>> = {
  en_revision: 'Tomas el caso y empiezas a revisarlo.',
  informacion_solicitada: 'Necesitas más datos de alguna de las partes.',
  resuelto: 'Registras la solución aplicada.',
  cerrado: 'Cierras el caso sin más acciones.',
};

const ADMIN_CLAIM_ERRORS: Record<string, string> = {
  CLAIM_TRANSITION: 'El reclamo cambió mientras lo revisabas. Recarga la página.',
  OWN_CLAIM: 'No puedes gestionar un reclamo de una contratación en la que eres parte.',
};

@Component({
  selector: 'app-admin-claim-detail',
  imports: [BackLink, RouterLink, Icon],
  templateUrl: './admin-claim-detail.html',
  styleUrls: ['../../_admin.scss', './admin-claim-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClaimDetailPage {
  readonly id = input.required<string>();

  private readonly admin = inject(AdminService);

  protected readonly reasonLabel = REASON_LABEL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly hint = HINT;
  protected readonly cop = formatCop;
  protected readonly maxResolution = MAX_DESCRIPTION;
  protected readonly dateTime = (iso: string) => formatShortDateTime(new Date(iso));
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));

  protected readonly claim = signal<AdminClaimDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly next = signal<ClaimState | null>(null);
  protected readonly resolution = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly flash = signal<string | null>(null);
  protected readonly zoomed = signal<string | null>(null);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  protected readonly options = computed(() => {
    const c = this.claim();
    return c ? CLAIM_TRANSITIONS[c.estado] : [];
  });

  protected readonly canSave = computed(() => !!this.next() && !!this.resolution().trim() && !this.saving());

  protected readonly history = computed(() => [...(this.claim()?.historial ?? [])].reverse());

  constructor() {
    toObservable(this.id)
      .pipe(
        tap(() => {
          this.claim.set(null);
          this.notFound.set(false);
        }),
        switchMap((id) => this.admin.claim(id).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((c) => (c ? this.claim.set(c) : this.notFound.set(true)));
  }

  protected save(event: Event): void {
    event.preventDefault();
    const state = this.next();
    if (!state || !this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    this.admin
      .changeClaimState(this.id(), state, this.resolution().trim())
      .pipe(
        switchMap(() => this.admin.claim(this.id())),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (c) => {
          this.claim.set(c);
          this.next.set(null);
          this.resolution.set('');
          this.flash.set(`El reclamo pasó a «${STATE_LABEL[state]}». Se notificó a ambas partes.`);
        },
        error: (err) => {
          const code = apiErrorCode(err) ?? '';
          this.error.set(ADMIN_CLAIM_ERRORS[code] ?? 'No pudimos guardar el cambio. Intenta de nuevo.');
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
