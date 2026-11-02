import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';

import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { TradeView, normalize } from '../../../../shared/data/trade-catalog';
import { TradeCatalogService } from '../../services/trade-catalog.service';

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

    private readonly catalog = toSignal(inject(TradeCatalogService).groups$, { initialValue: [] });

    protected readonly query = signal('');
    protected readonly groups = computed(() => {

        const q = normalize(this.query());
        if (!q) return this.catalog();

        return this.catalog().map((g) => ({
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

    protected pick(trade: TradeView): void {
        this.close();
        this.router.navigate(['/buscar'], { queryParams: { categoria: trade.id } });
    }
}
