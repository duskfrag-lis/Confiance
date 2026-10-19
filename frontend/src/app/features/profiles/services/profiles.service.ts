import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { ClientProfile, ClientProfileUpdate, Commune } from '../models/profiles.models';

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ProfilesService {
  private readonly http = inject(HttpClient);

  private zones$?: Observable<Commune[]>;

  zones(): Observable<Commune[]> {
    return (this.zones$ ??= this.http
      .get<ApiResponse<Commune[]>>(`${api}/catalogs/zones`)
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
}
