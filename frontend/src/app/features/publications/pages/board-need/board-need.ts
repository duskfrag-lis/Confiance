import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { digitsOnly, formatCop, formatLongDateTime, formatShortDate, groupThousands } from '../../../../shared/utils/format';
import { PhotoViewer } from '../../../profiles/components/photo-viewer/photo-viewer';
import { BlockKey, DayKey, ProviderProfile } from '../../../profiles/models/profiles.models';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { BoardNeed, INTEREST_STATE_LABEL, MAX_INTEREST_MESSAGE, MyInterest } from '../../models/need.models';
import { NeedsService } from '../../services/needs.service';

const MAX_PRICE = 30_000_000;

const ERRORS: Record<string, string> = {
  INTEREST_EXISTS: 'Ya habías mostrado interés en esta necesidad.',
};

@Component({
  selector: 'app-board-need',
  imports: [RouterLink, Icon, PhotoViewer],
  templateUrl: './board-need.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './board-need.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardNeedPage {
  private readonly needs = inject(NeedsService);
  private readonly profiles = inject(ProfilesService);

  readonly id = input.required<string>();

  protected readonly maxMessage = MAX_INTEREST_MESSAGE;
  protected readonly interestLabel = INTEREST_STATE_LABEL;
  protected readonly cop = formatCop;
  protected readonly group = groupThousands;
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));
  protected readonly shortDate = formatShortDate;

  protected readonly catalog = toSignal(this.profiles.availabilityCatalog());
  protected readonly need = signal<BoardNeed | null>(null);
  protected readonly provider = signal<ProviderProfile | null>(null);
  protected readonly mine = signal<MyInterest | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');

  protected readonly message = signal('');
  protected readonly price = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly justSent = signal(false);

  private readonly viewer = viewChild.required(PhotoViewer);

  protected readonly priceError = computed(() => (Number(this.price()) > MAX_PRICE ? `El precio puede ser de máximo ${formatCop(MAX_PRICE)}.` : null));

  protected readonly hasAvailability = computed(() => !!this.provider()?.disponibilidad.length);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    forkJoin([
      this.needs.getForProvider(id),
      this.needs.myInterests().pipe(catchError(() => of([] as MyInterest[]))),
      this.profiles.getProvider().pipe(catchError(() => of(null))),
    ]).subscribe({
      next: ([need, interests, provider]) => {
        this.need.set(need);
        this.mine.set(interests.find((i) => i.necesidad.id === need.id) ?? null);
        this.provider.set(provider);
        this.state.set('ready');
      },
      error: (e: HttpErrorResponse) => {
        this.state.set(e.status === 404 || e.status === 400 ? 'not-found' : 'error');
      },
    });
  }

  protected budget(n: BoardNeed): string {
    return n.presupuestoMin === n.presupuestoMax
      ? formatCop(n.presupuestoMin)
      : `${formatCop(n.presupuestoMin)} a ${formatCop(n.presupuestoMax)}`;
  }

  protected hasSlot(day: DayKey, block: BlockKey): boolean {
    return !!this.provider()?.disponibilidad.some((s) => s.dia === day && s.bloque === block);
  }

  protected setPrice(event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = digitsOnly(input.value);
    this.price.set(v);
    input.value = groupThousands(v);
  }

  protected openPhotos(start: number): void {
    const n = this.need();
    if (n?.fotos.length) this.viewer().open(n.fotos, n.titulo, start);
  }

  protected send(): void {
    const n = this.need();
    if (!n || this.sending() || this.priceError()) return;
    this.error.set(null);
    this.sending.set(true);
    const body = {
      ...(this.message().trim() ? { mensaje: this.message().trim() } : {}),
      ...(this.price() ? { precioPropuesto: Number(this.price()) } : {}),
    };
    this.needs
      .showInterest(n.id, body)
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (interest) => {
          this.mine.set(interest);
          this.justSent.set(true);
        },
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          if (code === 'INTEREST_EXISTS') this.load();
          this.error.set(
            ERRORS[code] ??
              ((e as HttpErrorResponse).status === 404
                ? 'Esta necesidad ya no está disponible: el cliente la cerró o eligió a otro prestador.'
                : 'No pudimos enviar tu interés. Inténtalo de nuevo.'),
          );
        },
      });
  }
}
