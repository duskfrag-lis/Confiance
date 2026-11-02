import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop } from '../../../../shared/utils/format';
import { Listing, ListingState } from '../../models/listing.models';
import { ListingsService } from '../../services/listings.service';

type Filter = 'all' | ListingState;

const FILTERS: { id: Filter; label: string; alwaysVisible: boolean }[] = [
  { id: 'all', label: 'Todos', alwaysVisible: true },
  { id: 'activo', label: 'Activos', alwaysVisible: true },
  { id: 'pausado', label: 'Pausados', alwaysVisible: true },
  { id: 'rechazado', label: 'Rechazados', alwaysVisible: false },
  { id: 'retirado', label: 'Retirados', alwaysVisible: false },
];

const STATE_LABEL: Record<ListingState, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  rechazado: 'Rechazado',
  retirado: 'Retirado',
};

const ERRORS: Record<string, string> = {
  LISTING_OPEN_CONTRACTS:
    'Tiene contrataciones en curso. Podrás retirarlo cuando todas estén completadas, canceladas o rechazadas. Mientras tanto puedes pausarlo.',
  LISTING_STATE: 'El estado del servicio cambió. Actualiza la página e inténtalo de nuevo.',
};

@Component({
  selector: 'app-my-listings',
  imports: [RouterLink, Icon],
  templateUrl: './my-listings.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../_list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyListingsPage {
  private readonly listings = inject(ListingsService);

  protected readonly stateLabel = STATE_LABEL;
  protected readonly cop = formatCop;

  protected readonly items = signal<Listing[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly filter = signal<Filter>('all');
  protected readonly busyId = signal<string | null>(null);
  protected readonly rowError = signal<{ id: string; message: string } | null>(null);
  protected readonly flash = signal<string | null>((history.state as { flash?: string } | null)?.flash ?? null);

  protected readonly toWithdraw = signal<Listing | null>(null);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawError = signal<string | null>(null);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');

  protected readonly filters = computed(() => {
    const list = this.items() ?? [];
    return FILTERS.map((f) => ({ ...f, count: f.id === 'all' ? list.length : list.filter((l) => l.estado === f.id).length })).filter(
      (f) => f.alwaysVisible || f.count > 0 || this.filter() === f.id,
    );
  });

  protected readonly visible = computed(() => {
    const list = this.items() ?? [];
    const f = this.filter();
    return f === 'all' ? list : list.filter((l) => l.estado === f);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.listings.listMine().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected price(l: Listing): string {
    return l.precioFijo ? this.cop(l.precioMin) : `${this.cop(l.precioMin)} a ${this.cop(l.precioMax)}`;
  }

  protected togglePause(l: Listing): void {
    if (this.busyId()) return;
    this.busyId.set(l.id);
    this.rowError.set(null);
    this.flash.set(null);
    const request = l.estado === 'activo' ? this.listings.pause(l.id) : this.listings.activate(l.id);
    request.pipe(finalize(() => this.busyId.set(null))).subscribe({
      next: (updated) => this.replace(updated),
      error: (e) => this.rowError.set({ id: l.id, message: ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos cambiar el estado. Inténtalo de nuevo.' }),
    });
  }

  protected askWithdraw(l: Listing): void {
    this.toWithdraw.set(l);
    this.withdrawError.set(null);
    this.confirmDialog().nativeElement.showModal();
  }

  protected confirmWithdraw(): void {
    const target = this.toWithdraw();
    if (!target || this.withdrawing()) return;
    this.withdrawing.set(true);
    this.listings
      .withdraw(target.id)
      .pipe(finalize(() => this.withdrawing.set(false)))
      .subscribe({
        next: () => {
          this.replace({ ...target, estado: 'retirado', acciones: [], fotos: [] });
          this.closeConfirm();
          this.flash.set(`«${target.titulo}» quedó retirado.`);
        },
        error: (e) => this.withdrawError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos retirar el servicio. Inténtalo de nuevo.'),
      });
  }

  protected closeConfirm(): void {
    this.confirmDialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.confirmDialog().nativeElement) this.closeConfirm();
  }

  private replace(updated: Listing): void {
    this.items.update((list) => list?.map((l) => (l.id === updated.id ? updated : l)) ?? null);
  }
}
