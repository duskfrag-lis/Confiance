import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatCop, formatShortDate } from '../../../../shared/utils/format';
import { PhotoViewer } from '../../components/photo-viewer/photo-viewer';
import { BlockKey, DayKey, Evidence, PublicProviderProfile } from '../../models/profiles.models';
import { ProfilesService } from '../../services/profiles.service';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

@Component({
  selector: 'app-public-profile',
  imports: [RouterLink, Avatar, Icon, PhotoViewer],
  templateUrl: './public-profile.html',
  styleUrls: ['../_profile-page.scss', './public-profile.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicProfilePage {
  private readonly profiles = inject(ProfilesService);
  private readonly title = inject(Title);
  protected readonly session = inject(CurrentUserService);

  readonly id = input.required<string>();

  protected readonly cop = formatCop;
  protected readonly date = formatShortDate;
  protected readonly stars = [1, 2, 3, 4, 5];

  protected readonly catalog = toSignal(this.profiles.availabilityCatalog());
  protected readonly state = signal<LoadState>('loading');
  protected readonly profile = signal<PublicProviderProfile | null>(null);

  private readonly reload = signal(0);
  private readonly viewer = viewChild.required(PhotoViewer);

  protected readonly minPrice = computed(() => {
    const prices = this.profile()?.publicaciones.map((p) => p.precioMin) ?? [];
    return prices.length ? Math.min(...prices) : null;
  });

  protected readonly hasRating = computed(() => !!this.profile()?.calificacion.cantidad);

  protected readonly requestAction = computed((): { link: string; query: Record<string, string>; hint: string | null } => {
    const user = this.session.current();
    if (!user) return { link: '/auth/iniciar-sesion', query: { volver: `/prestadores/${this.id()}` }, hint: null };
    if (user.perfilActivo === 'client') return { link: `/cliente/solicitar/${this.id()}`, query: {}, hint: null };
    return {
      link: '/prestador/cambiar-perfil',
      query: {},
      hint: user.perfiles.cliente ? 'Cambia a tu perfil de cliente para solicitarlo.' : 'Necesitas un perfil de cliente para solicitarlo.',
    };
  });

  constructor() {
    toObservable(computed(() => ({ id: this.id(), n: this.reload() })))
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(({ id }) =>
          this.profiles.getPublicProfile(id).pipe(
            catchError((e: HttpErrorResponse) => {
              this.state.set(e.status === 404 || e.status === 400 ? 'not-found' : 'error');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((p) => {
        if (!p) return;
        this.profile.set(p);
        this.state.set('ready');
        this.title.setTitle(`${p.nombre} | Confiance`);
      });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected hasSlot(day: DayKey, block: BlockKey): boolean {
    return !!this.profile()?.disponibilidad.some((s) => s.dia === day && s.bloque === block);
  }

  protected requestQuery(listingId?: string): Record<string, string> {
    const base = this.requestAction().query;
    return listingId && this.session.current()?.perfilActivo === 'client' ? { ...base, publicacion: listingId } : base;
  }

  protected openPhotos(e: Evidence, start = 0): void {
    if (e.fotos.length) this.viewer().open(e.fotos, e.descripcion, start);
  }
}
