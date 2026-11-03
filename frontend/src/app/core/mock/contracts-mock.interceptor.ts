import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { ContractAction } from '../../features/contracting/models/contract';

/**
 * Lo que aún no tiene backend: la calificación (E10). Pagos, cancelaciones, reagendamientos y reclamos ya van al
 * API real. Las claves viejas que pueda tener el navegador (pago, completado, estado…) se ignoran.
 */
interface Overlay {
  calificacion?: ContractDetailApi['calificacion'];
}

const KEY = 'confiance.mock.contracts';
const api = environment.apiUrl;

function readContracts(): Record<string, Overlay> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeContracts(store: Record<string, Overlay>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // sin almacenamiento (modo privado): la calificación simulada no se guarda
  }
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

/** Las acciones del API, con `calificar` según la calificación simulada. */
function apply(d: ContractDetailApi, o: Overlay | undefined): ContractDetailApi {
  const calificacion = o?.calificacion ?? d.calificacion ?? null;
  const acciones: ContractAction[] = d.acciones.filter((a) => a !== 'calificar');
  if (d.estado === 'completado' && !calificacion) acciones.push('calificar');
  return { ...d, calificacion, acciones };
}

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const contractsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];

  let m = path.match(/^\/contracts\/(\d+)$/);
  if (m && req.method === 'GET') {
    const id = m[1];
    return responses(next(req)).pipe(map((res) => res.clone({ body: { ...res.body!, data: apply(res.body!.data as ContractDetailApi, readContracts()[id]) } })));
  }

  m = path.match(/^\/contracts\/(\d+)\/rating$/);
  if (m && req.method === 'POST') {
    const id = m[1];
    const body = (req.body as Record<string, unknown>) ?? {};
    const detail = new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true });
    return responses(next(detail)).pipe(
      switchMap((res) => {
        const store = readContracts();
        const current = apply(res.body!.data as ContractDetailApi, store[id]);
        if (!current.acciones.includes('calificar')) {
          return fail(409, 'REQUEST_STATE', 'Esta contratación cambió de estado; vuelve a cargarla.', req.url);
        }
        store[id] = {
          calificacion: { puntaje: Number(body['puntaje']), comentario: (body['comentario'] as string) || null, fecha: new Date().toISOString() },
        };
        writeContracts(store);
        return ok({ id, estado: current.estado, fechaHora: current.fechaHora, valor: current.valor }, req.url);
      }),
    );
  }

  return next(req);
};
