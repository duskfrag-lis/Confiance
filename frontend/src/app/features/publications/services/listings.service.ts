import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { environment } from '../../../../environments/environment';
import { Listing, ListingInput } from '../models/listing.models';

const api = `${environment.apiUrl}/listings`;

@Injectable({ providedIn: 'root' })
export class ListingsService {
  private readonly http = inject(HttpClient);

  listMine(): Observable<Listing[]> {
    return this.http.get<ApiResponse<Listing[]>>(`${api}/mine`).pipe(unwrap());
  }

  getMine(id: string): Observable<Listing> {
    return this.http.get<ApiResponse<Listing>>(`${api}/mine/${id}`).pipe(unwrap());
  }

  create(input: ListingInput, photos: File[]): Observable<Listing> {
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => form.append(key, String(value)));
    photos.forEach((p) => form.append('fotos', p));
    return this.http.post<ApiResponse<Listing>>(api, form).pipe(unwrap());
  }

  update(id: string, input: ListingInput): Observable<Listing> {
    return this.http.put<ApiResponse<Listing>>(`${api}/${id}`, input).pipe(unwrap());
  }

  addPhoto(id: string, photo: File): Observable<Listing> {
    const form = new FormData();
    form.append('foto', photo);
    return this.http.post<ApiResponse<Listing>>(`${api}/${id}/photos`, form).pipe(unwrap());
  }

  removePhoto(id: string, photoId: string): Observable<Listing> {
    return this.http.delete<ApiResponse<Listing>>(`${api}/${id}/photos/${photoId}`).pipe(unwrap());
  }

  pause(id: string): Observable<Listing> {
    return this.http.post<ApiResponse<Listing>>(`${api}/${id}/pause`, {}).pipe(unwrap());
  }

  activate(id: string): Observable<Listing> {
    return this.http.post<ApiResponse<Listing>>(`${api}/${id}/activate`, {}).pipe(unwrap());
  }

  withdraw(id: string): Observable<void> {
    return this.http.post<void>(`${api}/${id}/withdraw`, {});
  }
}
