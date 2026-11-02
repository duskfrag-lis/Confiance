import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { POPULAR_TRADES, normalize } from '../../../../shared/data/trade-catalog';
import { TradeCatalogService } from '../../services/trade-catalog.service';
import { TradesModal } from '../../components/trades-modal/trades-modal';
import { HireWays } from '../../components/hire-ways/hire-ways';
import { TrustRules } from '../../components/trust-rules/trust-rules';
import { ProviderCta } from '../../components/provider-cta/provider-cta';
import { Faq } from '../../components/faq/faq';
import { FinalCta } from '../../components/final-cta/final-cta';


@Component({

    selector: 'app-home',
    imports: [RouterLink, Icon, TradesModal, HireWays, TrustRules, ProviderCta, Faq, FinalCta],
    templateUrl: './home.html',
    styleUrl: './home.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})

export class Home {

    private readonly tradesModal = viewChild.required(TradesModal);

    protected readonly features: { icon: IconName; title: string }[] = [

        { icon: 'shield-check', title: 'Identidad verificada' },
        { icon: 'star', title: 'Calificaciones reales' },
        { icon: 'chat', title: 'Chat por contratación' },
        { icon: 'calendar-check', title: 'Agenda sin choques' },
    ];

    private readonly groups = toSignal(inject(TradeCatalogService).groups$);

    protected readonly popularTrades = computed(() => {
        const all = (this.groups() ?? []).flatMap((g) => g.trades);
        return POPULAR_TRADES.map((name) => all.find((t) => normalize(t.name) === normalize(name))).filter((t) => !!t);
    });

    protected readonly tradeCount = computed(() => (this.groups() ?? []).reduce((n, g) => n + g.trades.length, 0));

    protected openAllTrades(): void {
        this.tradesModal().open();
    }
}
