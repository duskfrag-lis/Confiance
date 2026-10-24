import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { digitsOnly, formatCop, groupThousands } from '../../../../shared/utils/format';
import { BlockKey, PublicProviderProfile } from '../../../profiles/models/profiles.models';
import { ProfilesService } from '../../../profiles/services/profiles.service';
import { NewRequestData } from '../../models/contract-api.models';
import { ContractsService } from '../../services/contracts.service';

const MAX_VALUE = 30_000_000;
const MAX_ADDRESS = 255;
const STEP_MINUTES = 30;

const BLOCK_LABEL: Record<BlockKey, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

const ERRORS: Record<string, string> = {
  SELF_HIRE: 'No puedes contratar tus propios servicios.',
  INVALID_ZONE: 'Ese barrio ya no está disponible. Elige otro.',
  PAST_DATE: 'Ese horario ya pasó. Elige otro.',
  OUTSIDE_AVAILABILITY: 'Ese horario está fuera de la disponibilidad del prestador. Elige otro.',
  SLOT_TAKEN: 'El prestador ya tiene una contratación en ese día y franja. Elige otro horario.',
};

const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const label12 = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
const dayParts = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

@Component({
  selector: 'app-request-service',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './request-service.html',
  styleUrls: ['../../../../shared/styles/_page.scss', './request-service.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestServicePage {
  private readonly contracts = inject(ContractsService);
  private readonly profiles = inject(ProfilesService);
  private readonly router = inject(Router);

  readonly providerId = input.required<string>({ alias: 'prestador' });

  readonly listingParam = input<string | undefined>(undefined, { alias: 'publicacion' });

  protected readonly maxAddress = MAX_ADDRESS;
  protected readonly blockLabel = BLOCK_LABEL;
  protected readonly cop = formatCop;
  protected readonly group = groupThousands;
  protected readonly label12 = label12;

  protected readonly communes = toSignal(this.profiles.zones(), { initialValue: [] });

  protected readonly provider = signal<PublicProviderProfile | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly listingId = signal('');
  protected readonly data = signal<NewRequestData | null>(null);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsError = signal<string | null>(null);

  protected readonly date = signal('');
  protected readonly block = signal<BlockKey | ''>('');
  protected readonly time = signal('');
  protected readonly communeId = signal('');
  protected readonly neighborhoodId = signal('');
  protected readonly address = signal('');
  protected readonly value = signal('');

  protected readonly submitted = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  private prefilled = false;
  private pricedListing = '';

  protected readonly listing = computed(() => this.provider()?.publicaciones.find((p) => p.id === this.listingId()) ?? null);
  protected readonly neighborhoods = computed(() => this.communes().find((c) => c.id === this.communeId())?.barrios ?? []);

  protected readonly days = computed(() => {
    const seen = new Set<string>();
    for (const h of this.data()?.horarios ?? []) seen.add(h.fecha);
    return [...seen].map((fecha) => {
      const [weekday, day, month] = dayParts.formatToParts(new Date(`${fecha}T12:00:00Z`)).filter((p) => p.type !== 'literal').map((p) => p.value.replace('.', ''));
      return { fecha, weekday, day, month };
    });
  });

  protected readonly blocks = computed(() => (this.data()?.horarios ?? []).filter((h) => h.fecha === this.date()));

  protected readonly times = computed(() => {
    const slot = this.blocks().find((b) => b.bloque === this.block());
    if (!slot) return [];
    const start = toMinutes(slot.inicio);
    const end = toMinutes(slot.fin);
    const now = new Date(Date.now() - 5 * 3_600_000);
    const today = now.toISOString().slice(0, 10);
    const minNow = slot.fecha === today ? now.getUTCHours() * 60 + now.getUTCMinutes() + 30 : -1;
    const list: string[] = [];
    for (let m = start; m < end; m += STEP_MINUTES) if (m > minNow) list.push(toHHMM(m));
    return list;
  });

  protected readonly when = computed(() => {
    if (!this.date() || !this.time()) return null;
    const day = longDay.format(new Date(`${this.date()}T12:00:00Z`));
    return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${label12(this.time())}`;
  });

  protected readonly neighborhoodName = computed(() => this.neighborhoods().find((b) => b.id === this.neighborhoodId())?.nombre ?? null);

  protected readonly errors = computed(() => {
    const v = Number(this.value());
    return {
      when: !this.date() || !this.block() || !this.time() ? 'Elige el día, la franja y la hora.' : null,
      zone: !this.neighborhoodId() ? (this.communeId() ? 'Elige el barrio.' : 'Elige la comuna y el barrio.') : null,
      address: !this.address().trim() ? 'Escribe la dirección exacta.' : null,
      value: !v ? 'Escribe el valor que propones, mayor que cero.' : v > MAX_VALUE ? `Máximo ${formatCop(MAX_VALUE)}.` : null,
    };
  });

  protected readonly invalid = computed(() => Object.values(this.errors()).some(Boolean));

  constructor() {
    effect(() => {
      const id = this.providerId();
      untracked(() => this.loadProvider(id));
    });
    effect(() => {
      const id = this.listingId();
      if (id) untracked(() => this.loadSlots(id));
    });
  }

  private loadProvider(id: string): void {
    this.state.set('loading');
    this.profiles.getPublicProfile(id).subscribe({
      next: (p) => {
        this.provider.set(p);
        const wanted = this.listingParam();
        this.listingId.set(p.publicaciones.find((l) => l.id === wanted)?.id ?? p.publicaciones[0]?.id ?? '');
        this.state.set('ready');
      },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.status === 400 ? 'not-found' : 'error'),
    });
  }

  private loadSlots(listingId: string): void {
    this.slotsLoading.set(true);
    this.slotsError.set(null);
    this.data.set(null);
    this.contracts
      .newRequest(listingId)
      .pipe(finalize(() => this.slotsLoading.set(false)))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.pickDate(this.days()[0]?.fecha ?? '');
          if (!this.prefilled) {
            if (d.zona) {
              this.communeId.set(d.zona.comunaId);
              this.neighborhoodId.set(d.zona.barrioId);
            }
            if (d.direccion) this.address.set(d.direccion);
            this.prefilled = true;
          }
        
          if (this.pricedListing !== listingId) {
            this.value.set(String(d.publicacion.precioMin || ''));
            this.pricedListing = listingId;
          }
        },
        error: (e: HttpErrorResponse) =>
          this.slotsError.set(
            e.status === 404 ? 'Este servicio ya no está disponible. Elige otro.' : 'No pudimos cargar los horarios. Inténtalo de nuevo.',
          ),
      });
  }

  protected retrySlots(): void {
    this.loadSlots(this.listingId());
  }

  protected pickDate(fecha: string): void {
    this.date.set(fecha);
    this.pickBlock(this.blocks()[0]?.bloque ?? '');
  }

  protected pickBlock(block: BlockKey | ''): void {
    this.block.set(block);
    this.time.set(this.times()[0] ?? '');
  }

  protected setCommune(id: string): void {
    this.communeId.set(id);
    this.neighborhoodId.set('');
  }

  protected setValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = digitsOnly(input.value);
    this.value.set(v);
    input.value = groupThousands(v);
  }

  protected range(): string | null {
    const l = this.data()?.publicacion;
    if (!l) return null;
    return l.precioFijo ? formatCop(l.precioMin) : `${formatCop(l.precioMin)} a ${formatCop(l.precioMax)}`;
  }

  protected send(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.invalid() || this.sending()) return;

    this.sending.set(true);
    this.contracts
      .create({
        publicacionId: this.listingId(),
        fechaHora: `${this.date()}T${this.time()}:00-05:00`,
        barrioId: this.neighborhoodId(),
        direccion: this.address().trim(),
        valor: Number(this.value()),
      })
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (c) =>
          this.router.navigate(['/cliente/contrataciones', c.id], {
            state: { flash: 'Enviamos tu solicitud. El prestador tiene 48 horas para responder.' },
          }),
        error: (e) => {
          const code = apiErrorCode(e) ?? '';
          if (code === 'SLOT_TAKEN' || code === 'PAST_DATE' || code === 'OUTSIDE_AVAILABILITY') this.loadSlots(this.listingId());
          this.error.set(
            ERRORS[code] ??
              ((e as HttpErrorResponse).status === 404 ? 'Este servicio ya no está disponible.' : 'No pudimos enviar la solicitud. Inténtalo de nuevo.'),
          );
        },
      });
  }
}
