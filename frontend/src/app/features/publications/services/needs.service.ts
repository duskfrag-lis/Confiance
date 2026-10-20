import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { BoardNeed, MyInterest, Need, NeedInput, NeedInterest, NeedsBoardQuery, Page, SelectionResult } from '../models/need.models';

const api = `${environment.apiUrl}/needs`;

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

  select(id: string, interestId: string, value?: number): Observable<SelectionResult> {
    return this.http
      .post<ApiResponse<SelectionResult>>(`${api}/mine/${id}/interests/${interestId}/select`, value ? { valor: value } : {})
      .pipe(unwrap());
  }

  board(query: NeedsBoardQuery): Observable<Page<BoardNeed>> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return this.http.get<ApiResponse<Page<BoardNeed>>>(api, { params }).pipe(unwrap());
  }

  getForProvider(id: string): Observable<BoardNeed> {
    return this.http.get<ApiResponse<BoardNeed>>(`${api}/${id}`).pipe(unwrap());
  }

  showInterest(id: string, body: { mensaje?: string; precioPropuesto?: number }): Observable<MyInterest> {
    return this.http.post<ApiResponse<MyInterest>>(`${api}/${id}/interest`, body).pipe(unwrap());
  }

  myInterests(): Observable<MyInterest[]> {
    return this.http.get<ApiResponse<MyInterest[]>>(`${api}/interests/mine`).pipe(unwrap());
  }
}
