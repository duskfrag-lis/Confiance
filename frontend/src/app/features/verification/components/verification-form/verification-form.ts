import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { apiErrorCode } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';
import {
  DocumentType,
  MAX_INFO,
  MAX_NUMBER,
  MAX_PHOTO_MB,
  MAX_PHOTOS,
  PHOTO_TYPES,
  VerificationApi,
  VerificationRequest,
} from '../../models/verification.models';
import { VerificationService } from '../../services/verification.service';

interface Photo {
  file: File;
  url: string;
}

const ERRORS: Record<string, string> = {
  VERIFICATION_PENDING: 'Ya tienes una solicitud en revisión.',
  ALREADY_VERIFIED: 'Tu identidad ya está verificada.',
  EMAIL_NOT_VERIFIED: 'Primero verifica tu correo para enviar la solicitud.',
  INVALID_DOCUMENT_NUMBER: 'Revisa el número: la cédula debe tener de 6 a 10 dígitos.',
  INVALID_DOCUMENT_TYPE: 'Ese tipo de documento no está disponible. Recarga la página.',
  PHOTOS_REQUIRED: 'Agrega al menos una foto del documento.',
  VERIFICATION_PHOTOS: 'Puedes adjuntar de 1 a 5 fotos del documento.',
  INVALID_IMAGE: 'Alguna foto no es un JPG o PNG válido.',
  IMAGE_TOO_LARGE: 'Alguna foto supera los 5 MB.',
};

const SLOT_LABEL = ['Anverso', 'Reverso'];

@Component({
  selector: 'app-verification-form',
  imports: [Icon],
  templateUrl: './verification-form.html',
  styleUrl: './verification-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationForm {
  readonly types = input.required<DocumentType[]>();
  readonly previous = input<VerificationRequest | null>(null);
  readonly submitted = output<VerificationApi>();

  private readonly service = inject(VerificationService);

  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly maxPhotoMb = MAX_PHOTO_MB;
  protected readonly maxInfo = MAX_INFO;
  protected readonly maxNumber = MAX_NUMBER;

  protected readonly type = signal('');
  protected readonly number = signal('');
  protected readonly info = signal('');
  protected readonly photos = signal<Photo[]>([]);
  protected readonly photoError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly touched = signal(false);
  private readonly edited = signal(false);

  protected readonly selectedType = computed(() => this.type() || this.previous()?.tipoDocumento.id || this.types()[0]?.id || '');
  protected readonly currentNumber = computed(() => this.edited() ? this.number() : this.previous()?.numero ?? '');
  protected readonly numeric = computed(() => /^c[ée]dula/i.test(this.types().find((t) => t.id === this.selectedType())?.nombre ?? ''));
  protected readonly slotLabel = computed(() => SLOT_LABEL[this.photos().length] ?? 'Agregar');

  protected readonly numberError = computed(() => {
    const n = this.currentNumber().trim();
    if (!n) return 'Escribe el número del documento.';
    if (this.numeric() && !/^\d{6,10}$/.test(n)) return 'La cédula debe tener de 6 a 10 dígitos, sin puntos ni espacios.';
    if (!/^[A-Za-z0-9-]+$/.test(n)) return 'Usa solo letras, números o guiones.';
    return null;
  });

  protected readonly valid = computed(() => !!this.selectedType() && !this.numberError() && this.photos().length > 0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  protected setNumber(value: string): void {
    this.edited.set(true);
    this.number.set(this.numeric() ? value.replace(/\D/g, '') : value.replace(/\s/g, '').toUpperCase());
  }

  protected pick(event: Event): void {
    const el = event.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    const room = MAX_PHOTOS - this.photos().length;
    const valid = files.filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= MAX_PHOTO_MB * 1024 * 1024);
    this.photoError.set(
      valid.length < files.length
        ? `Algunas fotos no se agregaron: deben ser JPG o PNG de máximo ${MAX_PHOTO_MB} MB.`
        : files.length > room
          ? `Puedes adjuntar hasta ${MAX_PHOTOS} fotos.`
          : null,
    );
    this.photos.update((list) => [...list, ...valid.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  protected remove(p: Photo): void {
    URL.revokeObjectURL(p.url);
    this.photos.update((list) => list.filter((x) => x !== p));
    this.photoError.set(null);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    if (!this.valid() || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.service
      .submit({ documentType: this.selectedType(), number: this.currentNumber().trim(), info: this.info().trim(), photos: this.photos().map((p) => p.file) })
      .subscribe({
        next: (v) => {
          this.sending.set(false);
          this.submitted.emit(v);
        },
        error: (err) => {
          this.sending.set(false);
          this.error.set(ERRORS[apiErrorCode(err) ?? ''] ?? 'No pudimos enviar tu solicitud. Intenta de nuevo.');
        },
      });
  }
}
