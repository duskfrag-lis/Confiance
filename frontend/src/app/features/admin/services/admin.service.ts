import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { ClaimState } from '../../claims/models/claim.models';
import { AdminClaim, AdminClaimDetail, AdminForceMajeure, AdminSummary, AdminVerification, VerificationDecision } from '../models/admin.models';

const api = `${environment.apiUrl}/admin`;

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  summary(): Observable<AdminSummary> {
    return this.http.get<ApiResponse<AdminSummary>>(`${api}/summary`).pipe(unwrap());
  }

  claims(): Observable<AdminClaim[]> {
    return this.http.get<ApiResponse<AdminClaim[]>>(`${api}/claims`).pipe(unwrap());
  }

  claim(id: string): Observable<AdminClaimDetail> {
    return this.http.get<ApiResponse<AdminClaimDetail>>(`${api}/claims/${id}`).pipe(unwrap());
  }

  changeClaimState(id: string, state: ClaimState, resolution: string): Observable<unknown> {
    return this.http.post(`${api}/claims/${id}/status`, { estado: state, resolucion: resolution });
  }

  verifications(): Observable<AdminVerification[]> {
    return this.http.get<ApiResponse<AdminVerification[]>>(`${api}/verifications`).pipe(unwrap());
  }

  reviewVerification(id: string, decision: VerificationDecision, reason: string): Observable<unknown> {
    return this.http.post(`${api}/verifications/${id}/review`, { decision, motivo: reason || undefined });
  }

  forceMajeure(): Observable<AdminForceMajeure[]> {
    return this.http.get<ApiResponse<AdminForceMajeure[]>>(`${api}/force-majeure`).pipe(unwrap());
  }

  reviewForceMajeure(contractId: string, decision: 'aprobada' | 'rechazada'): Observable<unknown> {
    return this.http.post(`${api}/force-majeure/${contractId}/review`, { decision });
  }
}
