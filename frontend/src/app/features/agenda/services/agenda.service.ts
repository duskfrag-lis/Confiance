import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { Appointment } from '../models/appointment.models';

@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly http = inject(HttpClient);

  mine(): Observable<Appointment[]> {
    return this.http.get<ApiResponse<Appointment[]>>(`${environment.apiUrl}/appointments/mine`).pipe(unwrap());
  }
}
