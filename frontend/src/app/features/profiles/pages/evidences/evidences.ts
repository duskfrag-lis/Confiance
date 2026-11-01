import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import { formatShortDate } from '../../../../shared/utils/format';
import { PhotoViewer } from '../../components/photo-viewer/photo-viewer';
import { Evidence } from '../../models/profiles.models';
import { ProfilesService } from '../../services/profiles.service';

type Filter = 'all' | 'published' | 'withdrawn';

const MAX_PHOTOS = 5;
const MAX_PHOTO_MB = 5;
const MAX_DESCRIPTION = 300;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

const ERRORS: Record<string, string> = {
  EVIDENCE_PHOTOS: `Adjunta entre 1 y ${MAX_PHOTOS} fotos del trabajo.`,
  INVALID_IMAGE: 'Las fotos deben ser JPG o PNG.',
  IMAGE_TOO_LARGE: `Cada foto puede pesar máximo ${MAX_PHOTO_MB} MB.`,
};

@Component({
  selector: 'app-evidences',
  imports: [Icon, PhotoViewer],
  templateUrl: './evidences.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './evidences.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidencesPage {
  private readonly profiles = inject(ProfilesService);

  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly maxPhotoMb = MAX_PHOTO_MB;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly date = formatShortDate;

  protected readonly evidences = signal<Evidence[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly filter = signal<Filter>('all');

  protected readonly photos = signal<{ file: File; url: string }[]>([]);
  protected readonly description = signal('');
  protected readonly touched = signal(false);
  protected readonly publishing = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly published = signal(false);
  protected readonly dragging = signal(false);

  protected readonly toWithdraw = signal<Evidence | null>(null);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawError = signal<string | null>(null);

  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');
  private readonly viewer = viewChild.required(PhotoViewer);

  protected readonly counts = computed(() => {
    const list = this.evidences() ?? [];
    const withdrawn = list.filter((e) => e.retirada).length;
    return { all: list.length, published: list.length - withdrawn, withdrawn };
  });

  protected readonly visible = computed(() => {
    const list = this.evidences() ?? [];
    switch (this.filter()) {
      case 'published':
        return list.filter((e) => !e.retirada);
      case 'withdrawn':
        return list.filter((e) => e.retirada);
      default:
        return [...list.filter((e) => !e.retirada), ...list.filter((e) => e.retirada)];
    }
  });

  protected readonly formError = computed(() => {
    if (!this.photos().length) return 'Agrega al menos una foto del trabajo.';
    if (!this.description().trim()) return 'Describe el trabajo que hiciste.';
    return null;
  });

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  protected load(): void {
    this.loadError.set(false);
    this.profiles.listEvidences().subscribe({
      next: (list) => this.evidences.set(list),
      error: () => this.loadError.set(true),
    });
  }

  protected pickPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addPhotos([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.photos().length < MAX_PHOTOS) this.addPhotos([...(event.dataTransfer?.files ?? [])]);
  }

  private addPhotos(files: File[]): void {
    this.uploadError.set(null);
    this.published.set(false);

    const room = MAX_PHOTOS - this.photos().length;
    const valid: File[] = [];
    for (const f of files) {
      if (!PHOTO_TYPES.includes(f.type)) this.uploadError.set(ERRORS['INVALID_IMAGE']);
      else if (f.size > MAX_PHOTO_MB * 1024 * 1024) this.uploadError.set(`«${f.name}» supera los ${MAX_PHOTO_MB} MB.`);
      else valid.push(f);
    }
    if (valid.length > room) this.uploadError.set(`Puedes subir hasta ${MAX_PHOTOS} fotos por trabajo.`);

    const added = valid.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
    this.photos.update((list) => [...list, ...added]);
  }

  protected removePhoto(index: number): void {
    this.photos.update((list) => {
      URL.revokeObjectURL(list[index].url);
      return list.filter((_, i) => i !== index);
    });
  }

  protected publish(): void {
    this.touched.set(true);
    if (this.publishing() || this.formError()) return;
    this.uploadError.set(null);
    this.publishing.set(true);
    this.profiles
      .createEvidence(
        this.description().trim(),
        this.photos().map((p) => p.file),
      )
      .pipe(finalize(() => this.publishing.set(false)))
      .subscribe({
        next: (evidence) => {
          this.evidences.update((list) => [evidence, ...(list ?? [])]);
          this.photos().forEach((p) => URL.revokeObjectURL(p.url));
          this.photos.set([]);
          this.description.set('');
          this.touched.set(false);
          this.filter.set('all');
          this.published.set(true);
        },
        error: (e) => this.uploadError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos publicar el trabajo. Inténtalo de nuevo.'),
      });
  }

  protected openPhotos(e: Evidence, start = 0): void {
    if (e.fotos.length) this.viewer().open(e.fotos, e.descripcion, start);
  }

  protected askWithdraw(e: Evidence): void {
    this.toWithdraw.set(e);
    this.withdrawError.set(null);
    this.confirmDialog().nativeElement.showModal();
  }

  protected confirmWithdraw(): void {
    const target = this.toWithdraw();
    if (!target || this.withdrawing()) return;
    this.withdrawing.set(true);
    this.profiles
      .withdrawEvidence(target.id)
      .pipe(finalize(() => this.withdrawing.set(false)))
      .subscribe({
        next: () => {
          this.evidences.update((list) => list?.map((e) => (e.id === target.id ? { ...e, retirada: true, fotos: [] } : e)) ?? null);
          this.closeConfirm();
        },
        error: () => this.withdrawError.set('No pudimos retirar el trabajo. Inténtalo de nuevo.'),
      });
  }

  protected closeConfirm(): void {
    this.confirmDialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.confirmDialog().nativeElement) this.closeConfirm();
  }
}
