import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { digitsOnly, formatCop, formatLongDateTime, formatShortDate, groupThousands } from '../../../../shared/utils/format';
import { PhotoViewer } from '../../../profiles/components/photo-viewer/photo-viewer';
import { DayKey } from '../../../profiles/models/profiles.models';
import { INTEREST_STATE_LABEL, NEED_STATE_LABEL, Need, NeedInterest } from '../../models/need.models';
import { NeedsService } from '../../services/needs.service';
import { BackLink } from '../../../../shared/components/back-link/back-link';

const DAY_SHORT: Record<DayKey, string> = {
  lunes: 'lun',
  martes: 'mar',
  miercoles: 'mié',
  jueves: 'jue',
  viernes: 'vie',
  sabado: 'sáb',
  domingo: 'dom',
};
const DAY_ORDER = Object.keys(DAY_SHORT) as DayKey[];

const ERRORS: Record<string, string> = {
  PRICE_REQUIRED: 'Este prestador no propuso un precio: escribe el valor que acordarán.',
  NEED_STATE: 'Esta necesidad cambió de estado. Vuelve a cargar la página.',
  NEED_EXPIRED: 'La fecha preferida ya pasó, así que no se puede crear la solicitud. Cierra esta necesidad y publica otra.',
  PROVIDER_UNAVAILABLE: 'Este prestador ya no está disponible en Confiance. Elige a otro.',
  INTEREST_STATE: 'Este prestador ya no se puede elegir para esta necesidad. Elige a otro de los interesados.',
};

@Component({
  selector: 'app-need-detail',
  imports: [BackLink, RouterLink, Avatar, Icon, PhotoViewer],
  templateUrl: './need-detail.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './need-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedDetailPage {
  private readonly needs = inject(NeedsService);

  readonly id = input.required<string>();

  protected readonly stateLabel = NEED_STATE_LABEL;
  protected readonly interestLabel = INTEREST_STATE_LABEL;
  protected readonly cop = formatCop;
  protected readonly group = groupThousands;
  protected readonly longDate = (iso: string) => formatLongDateTime(new Date(iso));
  protected readonly shortDate = formatShortDate;
  protected readonly stars = [1, 2, 3, 4, 5];

  protected readonly need = signal<Need | null>(null);
  protected readonly interests = signal<NeedInterest[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly flash = signal<string | null>((history.state as { flash?: string } | null)?.flash ?? null);

  protected readonly candidate = signal<NeedInterest | null>(null);
  protected readonly value = signal('');
  protected readonly selecting = signal(false);
  protected readonly selectError = signal<string | null>(null);
  protected readonly selectedRequestId = signal<string | null>(null);

  protected readonly closing = signal(false);
  protected readonly closeError = signal<string | null>(null);

  private readonly selectDialog = viewChild.required<ElementRef<HTMLDialogElement>>('select');
  private readonly closeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('close');
  private readonly viewer = viewChild.required(PhotoViewer);

  protected readonly canSelect = computed(() => {
    const n = this.need();
    return !!n && n.estado === 'abierta' && !n.vencida;
  });

  protected readonly selected = computed(() => this.interests().find((i) => i.estado === 'seleccionado') ?? null);
  protected readonly requestId = computed(() => this.selectedRequestId() ?? this.need()?.solicitudId ?? null);
  protected readonly needsValue = computed(() => !this.candidate()?.precioPropuesto);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    forkJoin([this.needs.getMine(id), this.needs.interests(id)]).subscribe({
      next: ([need, interests]) => {
        this.need.set(need);
        this.interests.set(interests);
        this.state.set('ready');
      },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.status === 400 ? 'not-found' : 'error'),
    });
  }

  private refresh(): void {
    forkJoin([this.needs.getMine(this.id()), this.needs.interests(this.id())]).subscribe({
      next: ([need, interests]) => {
        this.need.set(need);
        this.interests.set(interests);
      },
      error: () => undefined,
    });
  }

  protected budget(n: Need): string {
    return n.presupuestoMin === n.presupuestoMax
      ? formatCop(n.presupuestoMin)
      : `${formatCop(n.presupuestoMin)} a ${formatCop(n.presupuestoMax)}`;
  }

  protected days(i: NeedInterest): string | null {
    const set = new Set(i.prestador.disponibilidad.map((s) => s.dia));
    const list = DAY_ORDER.filter((d) => set.has(d)).map((d) => DAY_SHORT[d]);
    return list.length ? list.join(', ') : null;
  }

  protected openPhotos(start: number): void {
    const n = this.need();
    if (n?.fotos.length) this.viewer().open(n.fotos, n.titulo, start);
  }

  protected askSelect(i: NeedInterest): void {
    this.candidate.set(i);
    this.value.set('');
    this.selectError.set(null);
    this.selectDialog().nativeElement.showModal();
  }

  protected setValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = digitsOnly(input.value);
    this.value.set(v);
    input.value = groupThousands(v);
  }

  protected confirmSelect(): void {
    const n = this.need();
    const i = this.candidate();
    if (!n || !i || this.selecting()) return;
    if (this.needsValue() && !Number(this.value())) return this.selectError.set('Escribe el valor del servicio, mayor que cero.');

    this.selecting.set(true);
    this.needs
      .select(n.id, i.id, this.needsValue() ? Number(this.value()) : undefined)
      .pipe(finalize(() => this.selecting.set(false)))
      .subscribe({
        next: (result) => {
          this.need.set({ ...n, estado: 'prestador_seleccionado', acciones: [] });
          this.interests.update((list) =>
            list.map((x) => ({ ...x, estado: x.id === i.id ? 'seleccionado' : x.estado === 'pendiente' ? 'no_seleccionado' : x.estado })),
          );
          this.selectedRequestId.set(result.solicitudId);
          this.flash.set(`Elegiste a ${i.prestador.nombre}. Creamos la solicitud por ${formatCop(result.valor)}; ahora espera su respuesta.`);
          this.selectDialog().nativeElement.close();
        },
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          this.selectError.set(ERRORS[code] ?? 'No pudimos seleccionar al prestador. Inténtalo de nuevo.');
          if (code === 'INTEREST_STATE' || code === 'NEED_STATE') this.refresh();
        },
      });
  }

  protected askClose(): void {
    this.closeError.set(null);
    this.closeDialog().nativeElement.showModal();
  }

  protected confirmClose(): void {
    const n = this.need();
    if (!n || this.closing()) return;
    this.closing.set(true);
    this.needs
      .close(n.id)
      .pipe(finalize(() => this.closing.set(false)))
      .subscribe({
        next: (updated) => {
          this.need.set(updated);
          this.interests.update((list) => list.map((x) => (x.estado === 'pendiente' ? { ...x, estado: 'no_seleccionado' } : x)));
          this.flash.set('Cerraste la necesidad. Ya no recibe intereses.');
          this.closeDialog().nativeElement.close();
        },
        error: (e) => this.closeError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos cerrar la necesidad. Inténtalo de nuevo.'),
      });
  }

  protected dismiss(dialog: HTMLDialogElement, event?: MouseEvent): void {
    if (!event || event.target === dialog) dialog.close();
  }
}
