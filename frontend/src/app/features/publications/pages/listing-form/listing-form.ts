import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { digitsOnly, formatCop, groupThousands } from '../../../../shared/utils/format';
import { ProviderProfile } from '../../../profiles/models/profiles.models';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { Listing, ListingInput, MAX_LISTING_PHOTOS, MAX_LISTING_PRICE } from '../../models/listing.models';
import { ListingsService } from '../../services/listings.service';

type PriceMode = 'range' | 'fixed';

const MAX_TITLE = 150;
const MAX_DESCRIPTION = 1000;
const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

const ERRORS: Record<string, string> = {
  TRADE_NOT_OFFERED: 'Ese oficio ya no está en tu perfil profesional. Elige otro.',
  INVALID_CATEGORY: 'Ese oficio ya no está disponible en el catálogo. Elige otro.',
  PRICE_RANGE: 'El precio máximo debe ser mayor o igual que el mínimo.',
  LISTING_PHOTOS: `Adjunta entre 1 y ${MAX_LISTING_PHOTOS} fotos del servicio.`,
  PHOTO_COUNT: 'Adjunta una sola foto a la vez.',
  INVALID_IMAGE: 'Las fotos deben ser JPG o PNG.',
  IMAGE_TOO_LARGE: `Cada foto puede pesar máximo ${MAX_PHOTO_MB} MB.`,
  LISTING_STATE: 'Este servicio ya no se puede editar.',
};


@Component({
  selector: 'app-listing-form',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './listing-form.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../_form.scss', './listing-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingFormPage {
  private readonly listings = inject(ListingsService);
  private readonly profiles = inject(ProfilesService);
  private readonly router = inject(Router);
  protected readonly session = inject(CurrentUserService);

  readonly id = input<string>();

  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly maxPhotos = MAX_LISTING_PHOTOS;
  protected readonly maxPhotoMb = MAX_PHOTO_MB;
  protected readonly cop = formatCop;
  protected readonly group = groupThousands;

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly provider = signal<ProviderProfile | null>(null);
  protected readonly listing = signal<Listing | null>(null);
  protected readonly loadError = signal(false);

  protected readonly title = signal('');
  protected readonly tradeId = signal('');
  protected readonly description = signal('');
  protected readonly priceMode = signal<PriceMode>('range');
  protected readonly minPrice = signal('');
  protected readonly maxPrice = signal('');
  protected readonly newPhotos = signal<{ file: File; url: string }[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal<string | null>(null);

  protected readonly ready = computed(() => !!this.provider() && (!this.isEdit() || !!this.listing()));
  protected readonly editable = computed(() => !this.isEdit() || !!this.listing()?.acciones.includes('editar'));

  protected readonly trades = computed(() => {
    const own = this.provider()?.oficios.map((o) => ({ id: o.id, nombre: o.nombre, missing: false })) ?? [];
    const current = this.listing()?.oficio;
    return current && !own.some((o) => o.id === current.id) ? [...own, { ...current, missing: true }] : own;
  });

  protected readonly photos = computed(() =>
    this.isEdit() ? (this.listing()?.fotos ?? []).map((f) => ({ key: f.id, url: f.url })) : this.newPhotos().map((p) => ({ key: p.url, url: p.url })),
  );

  protected readonly errors = computed(() => {
    const min = Number(this.minPrice());
    const max = this.priceMode() === 'fixed' ? min : Number(this.maxPrice());
    return {
      title: !this.title().trim() ? 'Escribe el título del servicio.' : null,
      trade: !this.tradeId() ? 'Elige el oficio del servicio.' : null,
      description: !this.description().trim() ? 'Describe qué incluye el servicio.' : null,
      minPrice: !this.minPrice()
        ? this.priceMode() === 'fixed' ? 'Escribe el precio.' : 'Escribe el precio mínimo.'
        : min > MAX_LISTING_PRICE ? `El precio puede ser de máximo ${formatCop(MAX_LISTING_PRICE)}.` : null,
      maxPrice:
        this.priceMode() === 'fixed'
          ? null
          : !this.maxPrice() ? 'Escribe el precio máximo.'
          : max > MAX_LISTING_PRICE ? `El precio puede ser de máximo ${formatCop(MAX_LISTING_PRICE)}.`
          : max < min ? 'Debe ser mayor o igual que el mínimo.' : null,
      photos: !this.photos().length ? 'Agrega al menos una foto del servicio.' : null,
    };
  });

  protected readonly invalid = computed(() => Object.values(this.errors()).some(Boolean));

  protected readonly previewPrice = computed(() => {
    const min = this.minPrice();
    if (!min) return null;
    const max = this.priceMode() === 'fixed' ? min : this.maxPrice();
    return !max || max === min ? formatCop(Number(min)) : `${formatCop(Number(min))} a ${formatCop(Number(max))}`;
  });

  protected readonly previewTrade = computed(() => this.trades().find((t) => t.id === this.tradeId())?.nombre ?? null);

  constructor() {
    this.profiles.getProvider().subscribe({
      next: (p) => {
        this.provider.set(p);
        if (!this.isEdit() && p.oficios.length === 1) this.tradeId.set(p.oficios[0].id);
      },
      error: () => this.loadError.set(true),
    });

    effect(() => {
      const id = this.id();
      if (id) untracked(() => this.loadListing(id));
    });

    inject(DestroyRef).onDestroy(() => this.newPhotos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  private loadListing(id: string): void {
    this.listings.getMine(id).subscribe({
      next: (l) => {
        this.listing.set(l);
        this.title.set(l.titulo);
        this.tradeId.set(l.oficio.id);
        this.description.set(l.descripcion);
        this.priceMode.set(l.precioFijo ? 'fixed' : 'range');
        this.minPrice.set(String(l.precioMin));
        this.maxPrice.set(String(l.precioMax));
      },
      error: () => this.loadError.set(true),
    });
  }

  protected setPrice(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = digitsOnly(input.value);
    (which === 'min' ? this.minPrice : this.maxPrice).set(value);
    input.value = groupThousands(value);
  }

  protected setMode(mode: PriceMode): void {
    this.priceMode.set(mode);
    if (mode === 'range' && !this.maxPrice()) this.maxPrice.set(this.minPrice());
  }

  protected pickPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.photoError.set(null);

    const room = MAX_LISTING_PHOTOS - this.photos().length;
    const valid = files.filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) this.photoError.set(ERRORS['INVALID_IMAGE']);
      else if (f.size > MAX_PHOTO_MB * 1024 * 1024) this.photoError.set(`«${f.name}» supera los ${MAX_PHOTO_MB} MB.`);
      else return true;
      return false;
    });
    if (valid.length > room) this.photoError.set(`Puedes tener hasta ${MAX_LISTING_PHOTOS} fotos por servicio.`);
    const accepted = valid.slice(0, room);
    if (!accepted.length) return;

    if (!this.isEdit()) {
      this.newPhotos.update((list) => [...list, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      return;
    }

    this.uploadSequentially(accepted);
  }

  private uploadSequentially(files: File[]): void {
    const [next, ...rest] = files;
    const id = this.id();
    if (!next || !id) return;
    this.photoBusy.set(true);
    this.listings
      .addPhoto(id, next)
      .pipe(finalize(() => this.photoBusy.set(false)))
      .subscribe({
        next: (l) => {
          this.listing.update((current) => (current ? { ...current, fotos: l.fotos } : l));
          this.uploadSequentially(rest);
        },
        error: (e) => this.photoError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos subir la foto. Inténtalo de nuevo.'),
      });
  }

  protected removePhoto(index: number): void {
    this.photoError.set(null);
    if (!this.isEdit()) {
      this.newPhotos.update((list) => {
        URL.revokeObjectURL(list[index].url);
        return list.filter((_, i) => i !== index);
      });
      return;
    }
    const id = this.id();
    const photo = this.listing()?.fotos[index];
    if (!id || !photo || this.photoBusy()) return;
    this.photoBusy.set(true);
    this.listings
      .removePhoto(id, photo.id)
      .pipe(finalize(() => this.photoBusy.set(false)))
      .subscribe({
        next: (l) => this.listing.update((current) => (current ? { ...current, fotos: l.fotos } : l)),
        error: (e) => this.photoError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos quitar la foto. Inténtalo de nuevo.'),
      });
  }

  protected save(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.invalid() || this.saving() || !this.editable()) return;

    const min = Number(this.minPrice());
    const input: ListingInput = {
      titulo: this.title().trim(),
      oficioId: this.tradeId(),
      descripcion: this.description().trim(),
      precioMin: min,
      precioMax: this.priceMode() === 'fixed' ? min : Number(this.maxPrice()),
    };

    const id = this.id();
    const request: Observable<Listing> = id ? this.listings.update(id, input) : this.listings.create(input, this.newPhotos().map((p) => p.file));
    const flash = id ? 'Guardamos los cambios del servicio.' : 'Tu servicio quedó publicado y ya lo pueden ver los clientes.';

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.router.navigate(['/prestador/servicios'], { state: { flash } }),
      error: (e) => this.error.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos guardar el servicio. Revisa los datos e inténtalo de nuevo.'),
    });
  }
}
