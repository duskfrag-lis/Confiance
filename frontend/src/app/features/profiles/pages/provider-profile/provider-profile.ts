import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthService } from '../../../auth/services/auth.service';
import { BlockKey, DayKey, ProviderProfile, ProviderSection } from '../../models/profiles.models';
import { ProfilesService } from '../../services/profiles.service';

type EditableSection = 'oficios' | 'descripcion' | 'zonas' | 'disponibilidad';

const MAX_TRADES = 3;
const MAX_DESCRIPTION = 500;
const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

const SECTION_LABEL: Record<ProviderSection, string> = {
  foto: 'Foto de perfil',
  oficios: 'Oficios',
  descripcion: 'Descripción',
  zonas: 'Zonas de atención',
  disponibilidad: 'Disponibilidad semanal',
  evidencias: 'Trabajos realizados',
};

const SECTIONS: ProviderSection[] = ['foto', 'oficios', 'descripcion', 'zonas', 'disponibilidad', 'evidencias'];

const VERIFICATION_LABEL = {
  pendiente: 'Verificación pendiente de revisión',
  aprobada: 'Identidad verificada',
  rechazada: 'Verificación rechazada',
  correccion: 'Verificación: corrección solicitada',
};

const ERRORS: Record<string, string> = {
  INVALID_CATEGORY: 'Alguno de los oficios ya no está disponible. Elige otro.',
  INVALID_ZONE: 'Alguna de las zonas ya no está disponible. Revísalas.',
  ZONES_REQUIRED: 'Elige al menos un barrio.',
  INVALID_IMAGE: 'La foto debe ser JPG o PNG.',
  IMAGE_TOO_LARGE: `La foto supera los ${MAX_PHOTO_MB} MB.`,
};

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

type ZoneDraft = Record<string, { whole: boolean; neighborhoods: string[] }>;

@Component({
  selector: 'app-provider-profile',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Icon],
  templateUrl: './provider-profile.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './provider-profile.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderProfilePage {
  private readonly profiles = inject(ProfilesService);
  protected readonly session = inject(CurrentUserService);

  protected readonly maxTrades = MAX_TRADES;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly sectionLabel = SECTION_LABEL;
  protected readonly verificationLabel = VERIFICATION_LABEL;

  protected readonly trades = toSignal(inject(AuthService).getTrades(), { initialValue: [] });
  protected readonly communes = toSignal(this.profiles.zones(), { initialValue: [] });
  protected readonly catalog = toSignal(this.profiles.availabilityCatalog());

  protected readonly profile = signal<ProviderProfile | null>(null);
  protected readonly loadError = signal(false);
  protected readonly editing = signal<EditableSection | null>(null);
  protected readonly saving = signal(false);
  protected readonly savedSection = signal<EditableSection | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly photoError = signal<string | null>(null);

  protected readonly draftTrades = signal<string[]>([]);
  protected readonly tradeQuery = signal('');
  protected readonly draftDescription = signal('');
  protected readonly draftZones = signal<ZoneDraft>({});
  protected readonly zoneCommune = signal('');
  protected readonly draftSlots = signal<Set<string>>(new Set());

  protected readonly checklist = computed(() => {
    const missing = new Set(this.profile()?.faltantes ?? []);
    return SECTIONS.map((s) => ({ section: s, done: !missing.has(s) }));
  });

  protected readonly progress = computed(() => {
    const items = this.checklist();
    return Math.round((items.filter((i) => i.done).length / items.length) * 100);
  });

  protected readonly tradeGroups = computed(() => {
    const q = normalize(this.tradeQuery());
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const t of this.trades()) {
      if (q && !normalize(t.name).includes(q) && !normalize(t.group).includes(q)) continue;
      groups.set(t.group, [...(groups.get(t.group) ?? []), { id: t.id, name: t.name }]);
    }
    return [...groups].map(([name, items]) => ({ name, items }));
  });

  protected readonly tradeName = computed(() => new Map(this.trades().map((t) => [t.id, t.name])));

  protected readonly selectedCommune = computed(() => this.communes().find((c) => c.id === this.zoneCommune()) ?? null);

  protected readonly zoneSummary = computed(() => {
    const draft = this.draftZones();
    return this.communes()
      .filter((c) => draft[c.id] && (draft[c.id].whole || draft[c.id].neighborhoods.length))
      .map((c) => {
        const d = draft[c.id];
        const names = c.barrios.filter((b) => d.neighborhoods.includes(b.id)).map((b) => b.nombre);
        return { id: c.id, label: d.whole ? `${c.nombre} (toda la comuna)` : `${names.join(', ')} · ${c.nombre}` };
      });
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    this.profiles.getProvider().subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.loadError.set(true),
    });
  }

  protected slotKey(day: DayKey, block: BlockKey): string {
    return `${day}:${block}`;
  }

  protected hasSlot(day: DayKey, block: BlockKey): boolean {
    return !!this.profile()?.disponibilidad.some((s) => s.dia === day && s.bloque === block);
  }

  protected goTo(section: ProviderSection): void {
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected edit(section: EditableSection): void {
    const p = this.profile();
    if (!p) return;
    this.error.set(null);
    this.savedSection.set(null);

    switch (section) {
      case 'oficios':
        this.draftTrades.set(p.oficios.map((o) => o.id));
        this.tradeQuery.set('');
        break;
      case 'descripcion':
        this.draftDescription.set(p.descripcion ?? '');
        break;
      case 'zonas':
        this.draftZones.set(
          Object.fromEntries(p.zonas.map((z) => [z.comunaId, { whole: z.completa, neighborhoods: z.barrios.map((b) => b.id) }])),
        );
        this.zoneCommune.set(p.zonas[0]?.comunaId ?? '');
        break;
      case 'disponibilidad':
        this.draftSlots.set(new Set(p.disponibilidad.map((s) => this.slotKey(s.dia, s.bloque))));
        break;
    }
    this.editing.set(section);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  protected toggleTrade(id: string): void {
    this.draftTrades.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_TRADES ? [...list, id] : list,
    );
  }

  protected toggleNeighborhood(communeId: string, id: string): void {
    this.draftZones.update((draft) => {
      const current = draft[communeId] ?? { whole: false, neighborhoods: [] };
      const neighborhoods = current.neighborhoods.includes(id)
        ? current.neighborhoods.filter((n) => n !== id)
        : [...current.neighborhoods, id];
      return { ...draft, [communeId]: { whole: false, neighborhoods } };
    });
  }

  protected toggleWholeCommune(communeId: string): void {
    this.draftZones.update((draft) => {
      const whole = !draft[communeId]?.whole;
      const all = this.communes().find((c) => c.id === communeId)?.barrios.map((b) => b.id) ?? [];
      return { ...draft, [communeId]: { whole, neighborhoods: whole ? all : [] } };
    });
  }

  protected removeCommune(communeId: string): void {
    this.draftZones.update(({ [communeId]: _, ...rest }) => rest);
  }

  protected isNeighborhoodOn(communeId: string, id: string): boolean {
    const d = this.draftZones()[communeId];
    return !!d && (d.whole || d.neighborhoods.includes(id));
  }

  protected toggleSlot(day: DayKey, block: BlockKey): void {
    const key = this.slotKey(day, block);
    this.draftSlots.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected save(): void {
    const section = this.editing();
    if (!section || this.saving()) return;
    this.error.set(null);

    let request: Observable<ProviderProfile>;
    switch (section) {
      case 'oficios':
        if (!this.draftTrades().length) return this.error.set('Elige al menos un oficio.');
        request = this.profiles.updateTrades(this.draftTrades());
        break;
      case 'descripcion': {
        const text = this.draftDescription().trim();
        if (!text) return this.error.set('Escribe tu descripción profesional: sin ella tu perfil queda incompleto.');
        request = this.profiles.updateDescription(text);
        break;
      }
      case 'zonas': {
        const entries = Object.entries(this.draftZones());
        const communeIds = entries.filter(([, z]) => z.whole).map(([id]) => id);
        const neighborhoodIds = entries.filter(([, z]) => !z.whole).flatMap(([, z]) => z.neighborhoods);
        if (!communeIds.length && !neighborhoodIds.length) return this.error.set('Elige al menos un barrio.');
        request = this.profiles.updateZones(neighborhoodIds, communeIds);
        break;
      }
      case 'disponibilidad': {
        const slots = [...this.draftSlots()].map((key) => {
          const [day, block] = key.split(':') as [DayKey, BlockKey];
          return { dia: day, bloque: block };
        });
        request = this.profiles.updateAvailability(slots);
        break;
      }
    }

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (p) => {
        this.profile.set({ ...this.profile(), ...p });
        this.editing.set(null);
        this.savedSection.set(section);
      },
      error: (e) => this.error.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos guardar los cambios. Inténtalo de nuevo.'),
    });
  }

  protected pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.photoError.set(null);
    if (!PHOTO_TYPES.includes(file.type)) return this.photoError.set(ERRORS['INVALID_IMAGE']);
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return this.photoError.set(ERRORS['IMAGE_TOO_LARGE']);

    this.uploading.set(true);
    this.profiles
      .updatePhoto(file)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (photoUrl) => {
          const u = this.session.current();
          if (u) this.session.set({ ...u, fotoUrl: photoUrl });
          this.load();
        },
        error: (e) => this.photoError.set(ERRORS[apiErrorCode(e) ?? ''] ?? 'No pudimos subir la foto. Inténtalo de nuevo.'),
      });
  }
}
