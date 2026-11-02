import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ClaimApi, ClaimReason, MAX_DESCRIPTION, MAX_PHOTO_MB, MAX_PHOTOS, PHOTO_TYPES, REASONS } from '../../models/claim.models';
import { ClaimsService } from '../../services/claims.service';

interface Photo {
  file: File;
  url: string;
}

const ERRORS: Record<string, string> = {
  CLAIM_OPEN: 'Ya tienes un reclamo en curso sobre esta contratación.',
  REQUEST_STATE: 'Esta contratación ya no admite reclamos. Recarga la página.',
  CLAIM_PHOTOS: 'Puedes adjuntar máximo 5 fotos.',
  INVALID_IMAGE: 'Las fotos deben ser JPG o PNG.',
  IMAGE_TOO_LARGE: 'Cada foto puede pesar máximo 5 MB.',
};

@Component({
  selector: 'app-claim-dialog',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .dialog {
      width: min(620px, calc(100% - 2rem));
    }
    .against {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 0.9rem;
      border-radius: 14px;
      background: var(--c-surface-2);
    }
    .against p {
      display: grid;
      gap: 0.1rem;
      min-width: 0;
    }
    .against small {
      color: var(--c-muted);
      font-size: 0.8125rem;
    }
    .against strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .group {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .group legend,
    .label {
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    .label small {
      color: var(--c-muted);
      font-weight: 400;
    }
    .reasons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .reason {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.7rem 0.8rem;
      border: 1px solid var(--c-border);
      border-radius: 12px;
      background: var(--c-white);
      cursor: pointer;
      transition:
        border-color var(--dur-fast) var(--ease-out),
        background-color var(--dur-fast) var(--ease-out);

      input {
        position: absolute;
        opacity: 0;
      }
      &:hover {
        border-color: var(--c-primary);
      }
      &:has(input:checked) {
        border-color: var(--c-primary);
        background: var(--c-primary-soft);
        box-shadow: inset 0 0 0 1px var(--c-primary);
      }
      &:has(input:focus-visible) {
        outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
        outline-offset: 2px;
      }
    }
    .reason__icon {
      display: grid;
      flex: none;
      place-items: center;
      color: var(--c-primary-dark);
    }
    .reason__text {
      display: grid;
      min-width: 0;
      font-size: 0.9rem;
      font-weight: 600;
      line-height: 1.25;
      small {
        color: var(--c-muted);
        font-size: 0.78rem;
        font-weight: 400;
      }
    }
    .photos {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .photo,
    .add {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 12px;
    }
    .photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      animation: fade-in var(--dur) var(--ease-out);
    }
    .photo button {
      position: absolute;
      top: 4px;
      right: 4px;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 50%;
      background: color-mix(in srgb, var(--c-text) 70%, transparent);
      color: var(--c-white);
      cursor: pointer;
    }
    .add {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.2rem;
      border: 1.5px dashed var(--c-border);
      background: var(--c-white);
      color: var(--c-muted);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease-out);

      input {
        position: absolute;
        opacity: 0;
        width: 1px;
      }
      &:hover {
        border-color: var(--c-primary);
        color: var(--c-primary-dark);
      }
      &:has(input:focus-visible) {
        outline: 3px solid color-mix(in srgb, var(--c-primary) 35%, transparent);
      }
    }
    .privacy {
      display: flex;
      gap: 0.55rem;
      color: var(--c-muted);
      font-size: 0.85rem;
      app-icon {
        flex: none;
        margin-top: 0.1rem;
      }
    }
    .error {
      color: var(--c-error);
      font-size: 0.875rem;
      font-weight: 500;
    }
    @media (max-width: 540px) {
      .reasons {
        grid-template-columns: minmax(0, 1fr);
      }
      .photos {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
  template: `
    <dialog #dialog class="dialog" (click)="onBackdrop($event)" (close)="reset()">
      <form class="dialog__form" (submit)="submit($event)">
        <header class="dialog__head">
          <div>
            <h2>Crear reclamo</h2>
            <p>Un administrador lo revisará y registrará la resolución.</p>
          </div>
          <button type="button" class="dialog__close" (click)="close()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </header>

        <div class="against">
          <app-avatar [name]="counterpart().name" [photoUrl]="counterpart().photoUrl" [size]="40" />
          <p>
            <small>Reclamo contra</small>
            <strong>{{ counterpart().name }}</strong>
            <small>{{ service() }}</small>
          </p>
        </div>

        <fieldset class="group">
          <legend>Motivo</legend>
          <div class="reasons">
            @for (r of reasons(); track r.id) {
              <label class="reason">
                <input type="radio" name="motivo" [value]="r.id" [checked]="reason() === r.id" (change)="reason.set(r.id)" />
                <span class="reason__icon"><app-icon [name]="r.icon" [size]="22" /></span>
                <span class="reason__text">{{ r.label }} <small>{{ r.hint }}</small></span>
              </label>
            }
          </div>
        </fieldset>

        <label class="dialog__field">
          Descripción
          <textarea
            placeholder="Explica qué ocurrió, cuándo y qué esperas que se haga."
            [maxLength]="maxDescription"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          ></textarea>
          <span class="dialog__hint">{{ description().length }}/{{ maxDescription }}</span>
        </label>

        <div class="group">
          <p class="label">Fotografías de evidencia <small>(opcional, hasta {{ maxPhotos }})</small></p>
          <div class="photos">
            @for (p of photos(); track p.url) {
              <div class="photo">
                <img [src]="p.url" [alt]="'Evidencia ' + ($index + 1)" />
                <button type="button" (click)="remove(p)" [attr.aria-label]="'Quitar foto ' + ($index + 1)">
                  <app-icon name="x" [size]="14" />
                </button>
              </div>
            }
            @if (photos().length < maxPhotos) {
              <label class="add">
                <input type="file" accept=".jpg,.jpeg,.png" multiple (change)="pick($event)" />
                <app-icon name="camera" [size]="22" />
                Agregar
              </label>
            }
          </div>
          <span class="dialog__hint">JPG o PNG de máximo {{ maxPhotoMb }} MB cada una.</span>
          @if (photoError()) {
            <span class="error" role="alert">{{ photoError() }}</span>
          }
        </div>

        <p class="privacy">
          <app-icon name="lock" [size]="16" />
          Solo tú, {{ firstName() }} y el administrador pueden ver este reclamo y sus fotos.
        </p>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Volver</button>
          <button type="submit" class="btn btn--primary btn--sm" [disabled]="!valid() || sending()">
            {{ sending() ? 'Enviando…' : 'Enviar reclamo' }}
          </button>
        </footer>
      </form>
    </dialog>
  `,
})
export class ClaimDialog {
  readonly created = output<ClaimApi>();

  private readonly claims = inject(ClaimsService);
  private readonly session = inject(CurrentUserService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly reasons = computed(() =>
    this.session.current()?.perfilActivo === 'provider' ? REASONS.filter((r) => r.id !== 'transferencia_no_confirmada') : REASONS,
  );
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly maxPhotoMb = MAX_PHOTO_MB;

  private contractId = '';
  protected readonly counterpart = signal<{ name: string; photoUrl: string | null }>({ name: '', photoUrl: null });
  protected readonly service = signal('');
  protected readonly reason = signal<ClaimReason | null>(null);
  protected readonly description = signal('');
  protected readonly photos = signal<Photo[]>([]);
  protected readonly photoError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);

  protected readonly firstName = computed(() => this.counterpart().name.split(' ')[0]);
  protected readonly valid = computed(() => !!this.reason() && !!this.description().trim());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  open(contractId: string, counterpart: { name: string; photoUrl: string | null }, service: string): void {
    this.contractId = contractId;
    this.counterpart.set(counterpart);
    this.service.set(service);
    this.reset();
    this.dialog().nativeElement.showModal();
  }

  protected reset(): void {
    if (this.sending()) return;
    this.photos().forEach((p) => URL.revokeObjectURL(p.url));
    this.reason.set(null);
    this.description.set('');
    this.photos.set([]);
    this.photoError.set(null);
    this.error.set(null);
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const room = MAX_PHOTOS - this.photos().length;
    const valid = files.filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= MAX_PHOTO_MB * 1024 * 1024);
    this.photoError.set(
      valid.length < files.length
        ? `Algunas fotos no se agregaron: deben ser JPG o PNG de máximo ${MAX_PHOTO_MB} MB.`
        : files.length > room
          ? `Solo puedes adjuntar ${MAX_PHOTOS} fotos.`
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
    const reason = this.reason();
    if (!reason || !this.valid() || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.claims.create(this.contractId, reason, this.description().trim(), this.photos().map((p) => p.file)).subscribe({
      next: (claim) => {
        this.sending.set(false);
        this.created.emit(claim);
        this.close();
      },
      error: (err) => {
        this.sending.set(false);
        this.error.set(ERRORS[apiErrorCode(err) ?? ''] ?? 'No pudimos enviar el reclamo. Intenta de nuevo.');
      },
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
