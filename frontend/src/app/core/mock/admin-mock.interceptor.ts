import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, catchError, filter, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminForceMajeure, AdminSummary } from '../../features/admin/models/admin.models';
import { isClosed } from '../../features/claims/models/claim.models';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { claimHistory, readClaims, sessionName } from './claims-mock.interceptor';
import { Overlay, readContracts, writeContracts } from './contracts-mock.interceptor';
import { readVerifications } from './verification-mock.interceptor';

// Simula el panel del administrador (E14) mientras el backend no lo tenga (mockApi).
// Para entrar sin una cuenta administradora: localStorage 'confiance.mock.admin' = '1' marca la sesión como administrador.
// Los reclamos (HU-57) y las verificaciones (HU-58) están en sus propios simuladores; aquí van el resumen y la fuerza mayor (HU-59).

const ADMIN_KEY = 'confiance.mock.admin';
const api = environment.apiUrl;

function forcedAdmin(): boolean {
  try {
    return localStorage.getItem(ADMIN_KEY) === '1';
  } catch {
    return false;
  }
}

type Pending = { id: string; overlay: Overlay };

function pendingForceMajeure(): Pending[] {
  return Object.entries(readContracts())
    .filter(([, o]) => o.cierre?.tipo === 'cancelado' && o.cierre.fuerzaMayor?.evaluacion === 'pendiente')
    .map(([id, overlay]) => ({ id, overlay }));
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const adminMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];

  if (path === '/auth/me' && req.method === 'GET' && forcedAdmin()) {
    return responses(next(req)).pipe(map((res) => res.clone({ body: { ...res.body!, data: { ...(res.body!.data as object), esAdmin: true } } })));
  }

  if (path === '/admin/summary' && req.method === 'GET') {
    const summary: AdminSummary = {
      reclamos: readClaims().filter((c) => !isClosed(claimHistory(c).at(-1)!.estado)).length,
      verificaciones: readVerifications().filter((v) => !v.estado).length,
      fuerzaMayor: pendingForceMajeure().length,
    };
    return ok(summary, req.url);
  }

  // HU-59: cancelaciones por fuerza mayor pendientes, de la más antigua a la más reciente
  if (path === '/admin/force-majeure' && req.method === 'GET') {
    const pending = pendingForceMajeure();
    if (!pending.length) return ok([] as AdminForceMajeure[], req.url);
    return forkJoin(
      pending.map(({ id, overlay }) =>
        responses(next(new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true }))).pipe(
          map((r): AdminForceMajeure | null => {
            const d = r.body!.data as ContractDetailApi;
            const cierre = overlay.cierre as Extract<ContractDetailApi['cierre'], { tipo: 'cancelado' }>;
            const byClient = cierre.por === 'cliente';
            const client = { nombre: d.cliente.nombre, rol: 'cliente' as const };
            const provider = { nombre: d.prestador.nombre, rol: 'prestador' as const };
            const stage = [...overlay.etapas].reverse().find((e) => e.estado === 'cancelado');
            const evidence = cierre.fuerzaMayor?.evidencia;
            return {
              contratacionId: id,
              servicio: d.servicio,
              canceladoPor: byClient ? client : provider,
              contraparte: byClient ? provider : client,
              motivo: cierre.motivo,
              evidencia: evidence ? { nombre: evidence, url: null } : null,
              cancelada: cierre.fecha,
              fechaServicio: overlay.fechaHora ?? d.fechaHora,
              estadoAlCancelar: stage?.estadoAnterior ?? 'confirmado',
            };
          }),
          catchError(() => of(null)),
        ),
      ),
    ).pipe(
      switchMap((list) =>
        ok(
          list.filter((x): x is AdminForceMajeure => !!x).sort((a, b) => a.cancelada.localeCompare(b.cancelada)),
          req.url,
        ),
      ),
    );
  }

  const m = path.match(/^\/admin\/force-majeure\/(\d+)\/review$/);
  if (m && req.method === 'POST') {
    const decision = (req.body as { decision?: string } | null)?.decision;
    if (decision !== 'aprobada' && decision !== 'rechazada') return fail(400, 'VALIDATION_ERROR', 'Elige aprobada o rechazada.', req.url);
    const store = readContracts();
    const overlay = store[m[1]];
    const cierre = overlay?.cierre;
    if (cierre?.tipo !== 'cancelado' || cierre.fuerzaMayor?.evaluacion !== 'pendiente') {
      return fail(409, 'ALREADY_REVIEWED', 'Esta cancelación ya fue evaluada.', req.url);
    }
    return sessionName(next).pipe(
      switchMap((admin) => {
        cierre.fuerzaMayor = { ...cierre.fuerzaMayor!, evaluacion: decision, fecha: new Date().toISOString(), admin };
        writeContracts(store);
        return ok({ contratacionId: m[1], evaluacion: decision }, req.url);
      }),
    );
  }

  return next(req);
};
