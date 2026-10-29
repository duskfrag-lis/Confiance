import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { TradeGroupView, groupTrades } from '../../../shared/data/trade-catalog';
import { AuthService } from '../../auth/services/auth.service';

/** Categorías y oficios de GET /api/categories con su ícono y color, cargados una sola vez para todo el sitio público. */
@Injectable({ providedIn: 'root' })
export class TradeCatalogService {
  readonly groups$: Observable<TradeGroupView[]> = inject(AuthService).getTrades().pipe(map(groupTrades), shareReplay(1));
}
