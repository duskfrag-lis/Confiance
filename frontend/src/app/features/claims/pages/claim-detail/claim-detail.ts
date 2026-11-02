import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatLongDateTime, formatShortDate } from '../../../../shared/utils/format';
import { ClaimApi, ClaimState, REASON_LABEL, STATE_LABEL, isClosed } from '../../models/claim.models';
import { ClaimsService } from '../../services/claims.service';
import { BackLink } from '../../../../shared/components/back-link/back-link';

const STEP_LABEL: Record<ClaimState, string> = {
  abierto: 'Reclamo abierto',
  en_revision: 'En revisión por un administrador',
  informacion_solicitada: 'Se solicitó más información',
  resuelto: 'Reclamo resuelto',
  cerrado: 'Reclamo cerrado',
};

@Component({
  selector: 'app-claim-detail',
  imports: [BackLink, RouterLink, Avatar, Icon],
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
    const done = c.historial.map((h) => ({ state: h.estado, label: STEP_LABEL[h.estado], at: h.fecha as string | null, note: h.nota, done: true, current: false }));
    return isClosed(c.estado) ? done : [...done, { state: c.estado, label: 'Resolución del administrador', at: null, note: null, done: false, current: true }];
  });

  protected readonly lastNote = computed(() => this.claim()?.historial.at(-1)?.nota ?? null);

  protected readonly next = computed(() => {
    const c = this.claim();
    if (!c) return '';
    if (c.estado === 'abierto') {
      return c.mio
        ? 'Un administrador revisará tu reclamo pronto. Te avisaremos con una notificación cada vez que cambie de estado.'
        : `${this.firstName()} presentó este reclamo. Un administrador lo revisará y puede contactarte para conocer tu versión.`;
    }
    if (c.estado === 'en_revision') return 'El administrador está revisando la descripción y las fotos, y puede contactar a ambas partes.';
    if (c.estado === 'informacion_solicitada') return 'El administrador necesita más información para resolver el caso y puede contactar a ambas partes.';
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
