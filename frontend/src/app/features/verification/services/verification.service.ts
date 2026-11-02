import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { DocumentType, VerificationApi } from '../models/verification.models';

const api = `${environment.apiUrl}/verification`;

export interface VerificationInput {
  documentType: string;
  number: string;
  info: string;
  photos: File[];
}

@Injectable({ providedIn: 'root' })
export class VerificationService {
  private readonly http = inject(HttpClient);

  mine(): Observable<VerificationApi> {
    return this.http.get<ApiResponse<VerificationApi>>(`${api}/mine`).pipe(unwrap());
  }

  documentTypes(): Observable<DocumentType[]> {
    return this.http.get<ApiResponse<DocumentType[]>>(`${api}/document-types`).pipe(unwrap());
  }

  submit(input: VerificationInput): Observable<VerificationApi> {
    const body = new FormData();
    body.append('tipoDocumento', input.documentType);
    body.append('numero', input.number);
    if (input.info) body.append('informacion', input.info);
    input.photos.forEach((p) => body.append('fotos', p));
    return this.http.post<ApiResponse<VerificationApi>>(api, body).pipe(unwrap());
  }
}
