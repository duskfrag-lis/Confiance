import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { Need, NeedInput, NeedInterest, SelectionResult } from '../models/need.models';

const api = `${environment.apiUrl}/needs`;

/** Necesidades del cliente y selección de prestador (HU-26, HU-30). */
@Injectable({ providedIn: 'root' })
export class NeedsService {
  private readonly http = inject(HttpClient);

  listMine(): Observable<Need[]> {
    return this.http.get<ApiResponse<Need[]>>(`${api}/mine`).pipe(unwrap());
  }

  getMine(id: string): Observable<Need> {
    return this.http.get<ApiResponse<Need>>(`${api}/mine/${id}`).pipe(unwrap());
  }

  create(input: NeedInput, photos: File[]): Observable<Need> {
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => form.append(key, String(value)));
    photos.forEach((p) => form.append('fotos', p));
    return this.http.post<ApiResponse<Need>>(api, form).pipe(unwrap());
  }

  close(id: string): Observable<Need> {
    return this.http.post<ApiResponse<Need>>(`${api}/${id}/close`, {}).pipe(unwrap());
  }

  interests(id: string): Observable<NeedInterest[]> {
    return this.http.get<ApiResponse<NeedInterest[]>>(`${api}/mine/${id}/interests`).pipe(unwrap());
  }

  /** `value` solo se envía si el prestador no propuso precio (HU-30.5). */
  select(id: string, interestId: string, value?: number): Observable<SelectionResult> {
    return this.http
      .post<ApiResponse<SelectionResult>>(`${api}/mine/${id}/interests/${interestId}/select`, value ? { valor: value } : {})
      .pipe(unwrap());
  }
}
