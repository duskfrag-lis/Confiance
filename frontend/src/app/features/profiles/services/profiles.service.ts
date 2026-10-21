import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import {
  AvailabilityCatalog,
  BankAccount,
  BlockKey,
  ClientProfile,
  ClientProfileUpdate,
  Commune,
  DayKey,
  Evidence,
  ProviderProfile,
  PublicProviderProfile,
} from '../models/profiles.models';

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ProfilesService {
  private readonly http = inject(HttpClient);

  private zones$?: Observable<Commune[]>;
  private availability?: Observable<AvailabilityCatalog>;

  zones(): Observable<Commune[]> {
    return (this.zones$ ??= this.http
      .get<ApiResponse<Commune[]>>(`${api}/catalogs/zones`)
      .pipe(unwrap(), shareReplay(1)));
  }

  availabilityCatalog(): Observable<AvailabilityCatalog> {
    return (this.availability ??= this.http
      .get<ApiResponse<AvailabilityCatalog>>(`${api}/catalogs/availability`)
      .pipe(unwrap(), shareReplay(1)));
  }

  getClient(): Observable<ClientProfile> {
    return this.http.get<ApiResponse<ClientProfile>>(`${api}/profiles/client`).pipe(unwrap());
  }

  updateClient(body: ClientProfileUpdate): Observable<ClientProfile> {
    return this.http.put<ApiResponse<ClientProfile>>(`${api}/profiles/client`, body).pipe(unwrap());
  }

  updatePhoto(file: File): Observable<string | null> {
    const form = new FormData();
    form.append('foto', file);
    return this.http
      .put<ApiResponse<{ fotoUrl: string | null }>>(`${api}/profiles/photo`, form)
      .pipe(unwrap(), map((r) => r.fotoUrl));
  }

  getProvider(): Observable<ProviderProfile> {
    return this.http.get<ApiResponse<ProviderProfile>>(`${api}/profiles/provider`).pipe(unwrap());
  }

  updateDescription(description: string): Observable<ProviderProfile> {
    return this.http.put<ApiResponse<ProviderProfile>>(`${api}/profiles/provider/description`, { descripcion: description }).pipe(unwrap());
  }

  updateTrades(tradeIds: string[]): Observable<ProviderProfile> {
    return this.http.put<ApiResponse<ProviderProfile>>(`${api}/profiles/provider/trades`, { oficios: tradeIds }).pipe(unwrap());
  }

  updateZones(neighborhoodIds: string[], communeIds: string[]): Observable<ProviderProfile> {
    return this.http.put<ApiResponse<ProviderProfile>>(`${api}/profiles/provider/zones`, { barrios: neighborhoodIds, comunas: communeIds }).pipe(unwrap());
  }

  updateAvailability(slots: { dia: DayKey; bloque: BlockKey }[]): Observable<ProviderProfile> {
    return this.http.put<ApiResponse<ProviderProfile>>(`${api}/profiles/provider/availability`, { franjas: slots }).pipe(unwrap());
  }

  getBankAccount(): Observable<BankAccount | null> {
    return this.http.get<ApiResponse<BankAccount | null>>(`${api}/profiles/provider/bank-account`).pipe(unwrap());
  }

  saveBankAccount(body: Omit<BankAccount, 'editable'>): Observable<BankAccount> {
    return this.http.put<ApiResponse<BankAccount>>(`${api}/profiles/provider/bank-account`, body).pipe(unwrap());
  }

  listEvidences(): Observable<Evidence[]> {
    return this.http.get<ApiResponse<Evidence[]>>(`${api}/profiles/provider/evidences`).pipe(unwrap());
  }

  createEvidence(description: string, photos: File[]): Observable<Evidence> {
    const form = new FormData();
    form.append('descripcion', description);
    photos.forEach((f) => form.append('fotos', f));
    return this.http.post<ApiResponse<Evidence>>(`${api}/profiles/provider/evidences`, form).pipe(unwrap());
  }

  withdrawEvidence(id: string): Observable<void> {
    return this.http.post<void>(`${api}/profiles/provider/evidences/${id}/withdraw`, {});
  }

  getPublicProfile(id: string): Observable<PublicProviderProfile> {
    return this.http.get<ApiResponse<PublicProviderProfile>>(`${api}/providers/${id}`).pipe(unwrap());
  }
}
