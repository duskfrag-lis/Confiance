import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatLongDateTime, formatShortDate } from '../../../../shared/utils/format';
import { ClaimApi, ClaimState, REASON_LABEL, STATE_LABEL } from '../../models/claim.models';
import { ClaimsService } from '../../services/claims.service';

const STEPS: { state: ClaimState; label: string }[] = [
  { state: 'abierto', label: 'Reclamo abierto' },
  { state: 'en_revision', label: 'En revisión por un administrador' },
  { state: 'resuelto', label: 'Resolución registrada' },
];

@Component({
  selector: 'app-claim-detail',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './claim-detail.html',
  styleUrl: './claim-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimDetailPage {
  readonly id = input.required<string>();

  private readonly claims = inject(ClaimsService);
  protected readonly session = inject(CurrentUserService);

  protected readonly reasonLabel = REASON_LABEL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly shortDate = formatShortDate;
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));

  protected readonly claim = signal<ClaimApi | null>(null);
  protected readonly notFound = signal(false);
  protected readonly zoomed = signal<string | null>(null);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  protected readonly firstName = computed(() => this.claim()?.contraparte.nombre.split(' ')[0] ?? '');

  protected readonly steps = computed(() => {
    const c = this.claim();
    if (!c) return [];
    const last = c.estado === 'rechazado' ? [{ state: 'rechazado' as const, label: 'Reclamo rechazado' }] : [STEPS[2]];
    const steps = [...STEPS.slice(0, 2), ...last].map((s) => {
      const at = c.historial.find((h) => h.estado === s.state)?.fecha ?? null;
      return { ...s, at, done: !!at, current: false };
    });
    const pending = steps.find((s) => !s.done);
    if (pending) pending.current = true;
    return steps;
  });

  protected readonly next = computed(() => {
    const c = this.claim();
    if (!c) return '';
    if (c.estado === 'abierto') {
      return c.mio
        ? 'Un administrador revisará tu reclamo pronto. Te avisaremos con una notificación cada vez que cambie de estado.'
        : `${this.firstName()} presentó este reclamo. Un administrador lo revisará y puede contactarte para conocer tu versión.`;
    }
    if (c.estado === 'en_revision') return 'El administrador está revisando la descripción y las fotos, y puede contactar a ambas partes.';
    return '';
  });

  constructor() {
    toObservable(this.id)
      .pipe(
        tap(() => {
          this.claim.set(null);
          this.notFound.set(false);
        }),
        switchMap((id) => this.claims.detail(id).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((c) => (c ? this.claim.set(c) : this.notFound.set(true)));
  }

  protected zoom(url: string): void {
    this.zoomed.set(url);
    this.viewer()?.nativeElement.showModal();
  }

  protected closeZoom(): void {
    this.viewer()?.nativeElement.close();
  }
}
