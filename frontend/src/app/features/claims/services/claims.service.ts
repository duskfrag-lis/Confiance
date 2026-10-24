import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { ClaimApi, ClaimReason } from '../models/claim.models';

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ClaimsService {
  private readonly http = inject(HttpClient);

  readonly items = signal<ClaimApi[] | null>(null);
  readonly loadError = signal(false);

  refresh(): void {
    this.http
      .get<ApiResponse<ClaimApi[]>>(`${api}/claims/mine`)
      .pipe(unwrap())
      .subscribe({
        next: (list) => {
          this.items.set(list);
          this.loadError.set(false);
        },
        error: () => this.loadError.set(true),
      });
  }

  detail(id: string): Observable<ClaimApi> {
    return this.http.get<ApiResponse<ClaimApi>>(`${api}/claims/${id}`).pipe(unwrap());
  }

  create(contractId: string, reason: ClaimReason, description: string, photos: File[]): Observable<ClaimApi> {
    const body = new FormData();
    body.append('motivo', reason);
    body.append('descripcion', description);
    photos.forEach((p) => body.append('fotos', p));
    return this.http
      .post<ApiResponse<ClaimApi>>(`${api}/contracts/${contractId}/claims`, body)
      .pipe(unwrap(), tap(() => this.refresh()));
  }
}
