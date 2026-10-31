import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { bogotaParts, digitsOnly, formatCop, groupThousands } from '../../../../shared/utils/format';
import { AuthService } from '../../../auth/services/auth.service';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { MAX_NEED_PHOTOS, NeedInput } from '../../models/need.models';
import { NeedsService } from '../../services/needs.service';
import { BackLink } from '../../../../shared/components/back-link/back-link';

const MAX_TITLE = 150;
const MAX_DESCRIPTION = 1000;
const MAX_ADDRESS = 255;
const MAX_BUDGET = 30_000_000;
const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

// De 6:00 a. m. a 8:00 p. m., cada media hora
const TIMES = Array.from({ length: 29 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const label = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return { value, label };
});

const ERRORS: Record<string, string> = {
  BUDGET_RANGE: 'El presupuesto máximo debe ser mayor o igual que el mínimo.',
  PAST_DATE: 'La fecha y la hora preferidas deben ser futuras.',
  NEED_PHOTOS: `Puedes adjuntar máximo ${MAX_NEED_PHOTOS} fotos.`,
  INVALID_CATEGORY: 'Ese oficio ya no está disponible. Elige otro.',
  INVALID_ZONE: 'Ese barrio ya no está disponible. Elige otro.',
  INVALID_IMAGE: 'Las fotos deben ser JPG o PNG.',
  IMAGE_TOO_LARGE: `Cada foto puede pesar máximo ${MAX_PHOTO_MB} MB.`,
};

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-need-form',
  imports: [BackLink, RouterLink, Icon],
  templateUrl: './need-form.html',
  styleUrls: ['../../../../shared/styles/_page.scss', '../_form.scss', './need-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedFormPage {
  private readonly needs = inject(NeedsService);
  private readonly profiles = inject(ProfilesService);
  private readonly router = inject(Router);

  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly maxAddress = MAX_ADDRESS;
  protected readonly maxPhotos = MAX_NEED_PHOTOS;
  protected readonly maxPhotoMb = MAX_PHOTO_MB;
  protected readonly times = TIMES;
  protected readonly group = groupThousands;
  protected readonly cop = formatCop;

  protected readonly trades = toSignal(inject(AuthService).getTrades(), { initialValue: [] });
  protected readonly communes = toSignal(this.profiles.zones(), { initialValue: [] });

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly category = signal('');
  protected readonly tradeId = signal('');
  protected readonly communeId = signal('');
  protected readonly neighborhoodId = signal('');
  protected readonly address = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly minBudget = signal('');
  protected readonly maxBudget = signal('');
  protected readonly photos = signal<{ file: File; url: string }[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly photoError = signal<string | null>(null);

  protected readonly today = (() => {
    const t = bogotaParts(new Date());
    return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  })();

  protected readonly categories = computed(() => [...new Set(this.trades().map((t) => t.group))].sort((a, b) => a.localeCompare(b, 'es')));
  protected readonly categoryTrades = computed(() => this.trades().filter((t) => t.group === this.category()));
  protected readonly neighborhoods = computed(() => this.communes().find((c) => c.id === this.communeId())?.barrios ?? []);

  protected readonly preferredAt = computed(() => (this.date() && this.time() ? `${this.date()}T${this.time()}:00-05:00` : null));

  protected readonly errors = computed(() => {
    const min = Number(this.minBudget());
    const max = Number(this.maxBudget());
    const at = this.preferredAt();
    return {
      title: !this.title().trim() ? 'Escribe un título corto para tu necesidad.' : null,
      description: !this.description().trim() ? 'Describe lo que necesitas.' : null,
      trade: !this.tradeId() ? (this.category() ? 'Elige el oficio.' : 'Elige la categoría y el oficio.') : null,
      zone: !this.neighborhoodId() ? (this.communeId() ? 'Elige el barrio.' : 'Elige la comuna y el barrio.') : null,
      address: !this.address().trim() ? 'Escribe la dirección exacta.' : null,
      when: !this.date() || !this.time() ? 'Elige la fecha y la hora.' : at && new Date(at).getTime() <= Date.now() ? 'Elige una fecha y hora futuras.' : null,
      minBudget: !this.minBudget() ? 'Escribe el presupuesto mínimo.' : min > MAX_BUDGET ? `Máximo ${formatCop(MAX_BUDGET)}.` : null,
      maxBudget: !this.maxBudget()
        ? 'Escribe el presupuesto máximo.'
        : max > MAX_BUDGET ? `Máximo ${formatCop(MAX_BUDGET)}.`
        : max < min ? 'Debe ser mayor o igual que el mínimo.' : null,
    };
  });

  protected readonly invalid = computed(() => Object.values(this.errors()).some(Boolean));

  constructor() {
    this.profiles.getClient().subscribe({
      next: (p) => {
        if (p.zona && !this.neighborhoodId()) {
          this.communeId.set(p.zona.comunaId);
          this.neighborhoodId.set(p.zona.barrioId);
        }
        if (p.direccion && !this.address()) this.address.set(p.direccion);
      },
      error: () => undefined,
    });
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  protected setCategory(value: string): void {
    this.category.set(value);
    this.tradeId.set('');
  }

  protected setCommune(value: string): void {
    this.communeId.set(value);
    this.neighborhoodId.set('');
  }

  protected setBudget(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = digitsOnly(input.value);
    (which === 'min' ? this.minBudget : this.maxBudget).set(value);
    input.value = groupThousands(value);
  }

  protected pickPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.photoError.set(null);

    const room = MAX_NEED_PHOTOS - this.photos().length;
    const valid = files.filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) this.photoError.set(ERRORS['INVALID_IMAGE']);
      else if (f.size > MAX_PHOTO_MB * 1024 * 1024) this.photoError.set(`«${f.name}» supera los ${MAX_PHOTO_MB} MB.`);
      else return true;
      return false;
    });
    if (valid.length > room) this.photoError.set(`Puedes adjuntar hasta ${MAX_NEED_PHOTOS} fotos.`);
    this.photos.update((list) => [...list, ...valid.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  protected removePhoto(index: number): void {
    this.photos.update((list) => {
      URL.revokeObjectURL(list[index].url);
      return list.filter((_, i) => i !== index);
    });
  }

  protected save(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.invalid() || this.saving()) return;

    const input: NeedInput = {
      titulo: this.title().trim(),
      descripcion: this.description().trim(),
      oficioId: this.tradeId(),
      barrioId: this.neighborhoodId(),
      direccion: this.address().trim(),
      fechaPreferida: this.preferredAt()!,
      presupuestoMin: Number(this.minBudget()),
      presupuestoMax: Number(this.maxBudget()),
    };

    this.saving.set(true);
    this.needs
      .create(input, this.photos().map((p) => p.file))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (need) =>
          this.router.navigate(['/cliente/necesidades', need.id], {
            state: { flash: 'Tu necesidad quedó publicada. Te avisaremos cuando un prestador muestre interés.' },
          }),
        error: (e) => this.error.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos publicar tu necesidad. Revisa los datos e inténtalo de nuevo.'),
      });
  }
}
