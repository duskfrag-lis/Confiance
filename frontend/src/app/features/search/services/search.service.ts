import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import { SearchPage, SearchQuery } from '../models/search.models';

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);

  search(query: SearchQuery): Observable<SearchPage> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false) params = params.set(key, String(value));
    });
    const filtered = Object.entries(query).some(([key, value]) => key !== 'pagina' && value !== undefined && value !== '' && value !== false);
    const url = filtered ? `${api}/search/listings` : `${api}/catalog/listings`;
    return this.http.get<ApiResponse<SearchPage>>(url, { params }).pipe(unwrap());
  }
}
