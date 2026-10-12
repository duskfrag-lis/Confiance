import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';

import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { TRADE_GROUPS, TradeItem } from '../../../../shared/data/trade-catalog';

const normalize = (s: string) =>
    s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();

@Component({

    selector: 'app-trades-modal',
    imports: [RouterLink, Icon],
    templateUrl: './trades-modal.html',
    styleUrl: './trades-modal.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})

export class TradesModal {

    private readonly router = inject(Router);
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
    private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('search');

    protected readonly query = signal('');
    protected readonly groups = computed(() => {

        const q = normalize(this.query());
        if (!q) return TRADE_GROUPS;

        return TRADE_GROUPS.map((g) => ({
        ...g,
        trades: g.trades.filter((t) => normalize(t.name).includes(q)),
        })).filter((g) => g.trades.length > 0);
    });

    open(): void {
        this.query.set('');
        this.dialog().nativeElement.showModal();
        this.searchInput().nativeElement.focus();
    }

    protected close(): void {
        this.dialog().nativeElement.close();
    }

    protected onSearch(event: Event): void {
        this.query.set((event.target as HTMLInputElement).value);
    }

    protected onBackdropClick(event: MouseEvent): void {
        if (event.target === this.dialog().nativeElement) this.close();
    }

    // TODO: cuando exista la búsqueda (HU-28), llevar a /buscar?oficio=<id>.
    protected pick(trade: TradeItem): void {
        this.close();
        this.router.navigate(['/oficios'], { queryParams: { oficio: trade.id } });
    }
}
