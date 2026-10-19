import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { FieldError } from '../../../../shared/components/field-error/field-error';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthService } from '../../../auth/services/auth.service';
import { ClientProfile } from '../../models/profiles.models';
import { ProfilesService } from '../../services/profiles.service';

const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const MAX_DESCRIPTION = 200;

const PHOTO_ERRORS: Record<string, string> = {
  INVALID_IMAGE: 'La foto debe ser JPG o PNG.',
  IMAGE_TOO_LARGE: `La foto supera los ${MAX_PHOTO_MB} MB.`,
};

const monthYear = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

const splitFirst = (full: string): [string, string] => {
  const [first = '', ...rest] = full.trim().split(/\s+/);
  return [first, rest.join(' ')];
};

const joinNames = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');

@Component({
  selector: 'app-client-profile',
  imports: [ReactiveFormsModule, RouterLink, Avatar, Icon, FieldError],
  templateUrl: './client-profile.html',
  styleUrl: './client-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientProfilePage {
  private readonly profiles = inject(ProfilesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly session = inject(CurrentUserService);

  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly zones = toSignal(this.profiles.zones(), { initialValue: [] });

  protected readonly profile = signal<ClientProfile | null>(null);
  protected readonly loadError = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly photoError = signal<string | null>(null);
  protected readonly switching = signal(false);

  protected readonly form = new FormGroup({
    primerNombre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    segundoNombre: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    primerApellido: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    segundoApellido: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    celular: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^3\d{9}$/)] }),
    comunaId: new FormControl('', { nonNullable: true }),
    barrioId: new FormControl('', { nonNullable: true }),
    direccion: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    descripcion: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_DESCRIPTION)] }),
  });

  private readonly comunaId = toSignal(this.form.controls.comunaId.valueChanges, { initialValue: '' });
  private readonly descripcion = toSignal(this.form.controls.descripcion.valueChanges, { initialValue: '' });

  protected readonly barrios = computed(() => this.zones().find((c) => c.id === this.comunaId())?.barrios ?? []);
  protected readonly descriptionLength = computed(() => this.descripcion().length);

  protected readonly fullName = computed(() => {
    const p = this.profile();
    return p ? `${p.nombres} ${p.apellidos}` : this.session.fullName();
  });

  protected readonly memberSince = computed(() => {
    const since = this.profile()?.miembroDesde;
    return since ? monthYear.format(new Date(since)) : null;
  });

  protected readonly hasProviderProfile = computed(() => !!this.session.current()?.perfiles.prestador);

  constructor() {
    this.load();
    this.form.controls.comunaId.valueChanges.subscribe(() => this.form.controls.barrioId.setValue(''));
  }

  protected load(): void {
    this.loadError.set(false);
    this.profiles.getClient().subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.loadError.set(true),
    });
  }

  protected formatPhone(phone: string): string {
    return phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
  }

  protected startEdit(): void {
    const p = this.profile();
    if (!p) return;
    const [primerNombre, segundoNombre] = splitFirst(p.nombres);
    const [primerApellido, segundoApellido] = splitFirst(p.apellidos);
    this.form.reset({
      primerNombre,
      segundoNombre,
      primerApellido,
      segundoApellido,
      celular: p.celular,
      comunaId: p.zona?.comunaId ?? '',
      direccion: p.direccion ?? '',
      descripcion: p.descripcion ?? '',
    });
    this.form.controls.barrioId.setValue(p.zona?.barrioId ?? '');
    this.submitted.set(false);
    this.serverError.set(null);
    this.saved.set(false);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected err(name: keyof typeof this.form.controls): string | null {
    const c = this.form.controls[name];
    if (c.valid || !(c.touched || this.submitted())) return null;
    if (c.hasError('required')) {
      return name === 'celular' ? 'Ingresa tu número de celular.' : name === 'primerNombre' ? 'Ingresa tu nombre.' : 'Ingresa tu apellido.';
    }
    if (c.hasError('pattern')) return 'Ingresa un celular colombiano de 10 dígitos que empiece por 3.';
    if (c.hasError('maxlength')) return 'Es demasiado largo.';
    return null;
  }

  protected zoneError(): string | null {
    const v = this.form.getRawValue();
    return this.submitted() && v.comunaId && !v.barrioId ? 'Elige el barrio de la comuna.' : null;
  }

  protected save(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.zoneError() || this.saving()) return;

    const v = this.form.getRawValue();
    const nombres = joinNames(v.primerNombre, v.segundoNombre);
    const apellidos = joinNames(v.primerApellido, v.segundoApellido);
    if (nombres.length > 50 || apellidos.length > 50) {
      this.serverError.set('Los nombres y los apellidos pueden tener máximo 50 caracteres cada uno.');
      return;
    }

    this.saving.set(true);
    this.profiles
      .updateClient({
        nombres,
        apellidos,
        celular: v.celular,
        barrioId: v.barrioId || null,
        direccion: v.direccion.trim() || null,
        descripcion: v.descripcion.trim() || null,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (p) => {
          this.profile.set({ ...this.profile(), ...p });
          const u = this.session.current();
          if (u) this.session.set({ ...u, nombres: p.nombres, apellidos: p.apellidos });
          this.editing.set(false);
          this.saved.set(true);
        },
        error: (e) =>
          this.serverError.set(
            apiErrorCode(e) === 'INVALID_ZONE'
              ? 'Ese barrio ya no está disponible. Elige otro.'
              : 'No pudimos guardar tus datos. Inténtalo de nuevo.',
          ),
      });
  }

  protected pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.photoError.set(null);
    if (!PHOTO_TYPES.includes(file.type)) return this.photoError.set(PHOTO_ERRORS['INVALID_IMAGE']);
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return this.photoError.set(PHOTO_ERRORS['IMAGE_TOO_LARGE']);

    this.uploading.set(true);
    this.profiles
      .updatePhoto(file)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (fotoUrl) => {
          const p = this.profile();
          if (p) this.profile.set({ ...p, fotoUrl });
          const u = this.session.current();
          if (u) this.session.set({ ...u, fotoUrl });
        },
        error: (e) => this.photoError.set(PHOTO_ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos subir la foto. Inténtalo de nuevo.'),
      });
  }

  protected switchToProvider(): void {
    if (this.switching()) return;
    this.switching.set(true);
    this.auth
      .switchProfile('provider')
      .pipe(finalize(() => this.switching.set(false)))
      .subscribe(() => this.router.navigateByUrl('/prestador'));
  }
}
