import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { tradesById } from '../../../../shared/data/trade-catalog';
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

    // Temporal: cuando exista el backend saldrán de los oficios con más contrataciones.
    protected readonly popularTrades = tradesById([

        'fontaneria',
        'electricidad',
        'carpinteria',
        'pintura',
        'cerrajeria',
        'albanileria',
        'aseo',
        'reparaciones-generales',
    ]);

    protected openAllTrades(): void {
        this.tradesModal().open();
    }
}
