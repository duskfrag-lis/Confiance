import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, catchError, filter, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { CLAIM_TRANSITIONS, ClaimApi, ClaimReason, ClaimState, ClaimStep, MAX_DESCRIPTION, MAX_PHOTOS, REASONS, isClosed } from '../../features/claims/models/claim.models';
import { AdminClaim, AdminClaimDetail } from '../../features/admin/models/admin.models';

// Simula los reclamos de la E12 (HU-54) y su gestión por el administrador (HU-57) mientras el backend no los tenga (mockApi).
// El reclamo no avanza solo: solo el administrador cambia su estado, siempre con una nota.

type Role = 'cliente' | 'prestador';

export interface StoredClaim {
  id: string;
  contratacionId: string;
  motivo: ClaimReason;
  descripcion: string;
  creado: string;
  iniciadoPor: Role;
  fotos: string[];
  historial?: (ClaimStep & { admin: string | null })[];
}

export const CLAIMS_KEY = 'confiance.mock.claims';
const FIRST_ID = 301;
const PHOTO_MAX_PX = 900;
const api = environment.apiUrl;

export function readClaims(): StoredClaim[] {
  try {
    return JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** false si el navegador no tiene espacio (las fotos ocupan mucho): el reclamo no se crea. */
function writeClaims(list: StoredClaim[]): boolean {
  try {
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function claimHistory(c: StoredClaim): (ClaimStep & { admin: string | null })[] {
  return c.historial ?? [{ estado: 'abierto', fecha: c.creado, nota: null, admin: null }];
}

/** Reduce la foto para que quepa en localStorage. */
export function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

function view(c: StoredClaim, d: ContractDetailApi): ClaimApi {
  const role = d.rol as Role;
  const history = claimHistory(c);
  const last = history.at(-1)!;
  const mine = c.iniciadoPor === role;
  const other = role === 'cliente' ? d.prestador : d.cliente;
  return {
    id: c.id,
    contratacionId: c.contratacionId,
    servicio: d.servicio,
    motivo: c.motivo,
    descripcion: c.descripcion,
    estado: last.estado,
    creado: c.creado,
    mio: mine,
    contraparte: { nombre: other.nombre, fotoUrl: other.fotoUrl },
    fotos: c.fotos,
    historial: history.map(({ admin: _, ...h }) => h),
    resolucion: isClosed(last.estado) && last.nota ? { texto: last.nota, fecha: last.fecha } : null,
  };
}

function adminView(c: StoredClaim, d: ContractDetailApi | null): AdminClaim {
  const history = claimHistory(c);
  const client = { nombre: d?.cliente.nombre ?? '—', rol: 'cliente' as const };
  const provider = { nombre: d?.prestador.nombre ?? '—', rol: 'prestador' as const };
  return {
    id: c.id,
    contratacionId: c.contratacionId,
    servicio: d?.servicio ?? 'Contratación #' + c.contratacionId,
    motivo: c.motivo,
    estado: history.at(-1)!.estado,
    creado: c.creado,
    actualizado: history.at(-1)!.fecha,
    presentadoPor: c.iniciadoPor === 'cliente' ? client : provider,
    contra: c.iniciadoPor === 'cliente' ? provider : client,
  };
}


export const claimsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];
  const detail = (id: string) =>
    responses(next(new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true }))).pipe(map((r) => r.body!.data as ContractDetailApi));

  if (path === '/claims/mine' && req.method === 'GET') {
    return responses(next(new HttpRequest('GET', `${api}/contracts/mine`, { withCredentials: true }))).pipe(
      switchMap((res) => {
        const mine = new Set((res.body!.data as { id: string }[]).map((c) => c.id));
        const claims = readClaims().filter((c) => mine.has(c.contratacionId));
        if (!claims.length) return ok([] as ClaimApi[], req.url);
        const ids = [...new Set(claims.map((c) => c.contratacionId))];
        return forkJoin(ids.map(detail)).pipe(
          switchMap((details) => {
            const byId = new Map(details.map((d) => [d.id, d]));
            const list = claims.map((c) => view(c, byId.get(c.contratacionId)!)).sort((a, b) => b.creado.localeCompare(a.creado));
            return ok(list, req.url);
          }),
        );
      }),
    );
  }

  let m = path.match(/^\/claims\/(\d+)$/);
  if (m && req.method === 'GET') {
    const claim = readClaims().find((c) => c.id === m![1]);
    if (!claim) return fail(404, 'NOT_FOUND', 'No encontramos el reclamo.', req.url);
    // Solo las partes de la contratación lo ven: si no es tuya, el detalle de la contratación responde 403/404
    return detail(claim.contratacionId).pipe(switchMap((d) => ok(view(claim, d), req.url)));
  }

  m = path.match(/^\/contracts\/(\d+)\/claims$/);
  if (m && req.method === 'POST') {
    const id = m[1];
    const body = req.body as FormData;
    const reason = String(body.get('motivo') ?? '') as ClaimReason;
    const description = String(body.get('descripcion') ?? '').trim();
    const photos = body.getAll('fotos').filter((f): f is File => f instanceof File);
    if (!REASONS.some((r) => r.id === reason) || !description || description.length > MAX_DESCRIPTION || photos.length > MAX_PHOTOS) {
      return fail(400, 'VALIDATION_ERROR', 'Revisa el motivo, la descripción y las fotos.', req.url);
    }
    return detail(id).pipe(
      switchMap((d) => {
        if (!d.acciones.includes('reclamar')) return fail(409, 'REQUEST_STATE', 'Esta contratación no admite reclamos en su estado actual.', req.url);
        const role = d.rol as Role;
        const list = readClaims();
        if (list.some((c) => c.contratacionId === id && c.iniciadoPor === role && !isClosed(claimHistory(c).at(-1)!.estado))) {
          return fail(409, 'CLAIM_EXISTS', 'Ya tienes un reclamo en curso sobre esta contratación.', req.url);
        }
        return from(Promise.all(photos.map(shrinkPhoto))).pipe(
          switchMap((fotos) => {
            const next = String(Math.max(FIRST_ID - 1, ...list.map((c) => Number(c.id))) + 1);
            const claim: StoredClaim = { id: next, contratacionId: id, motivo: reason, descripcion: description, creado: new Date().toISOString(), iniciadoPor: role, fotos };
            if (!writeClaims([...list, claim])) {
              return fail(507, 'STORAGE_FULL', 'El navegador no tiene espacio para guardar el reclamo con sus fotos.', req.url);
            }
            return ok(view(claim, d), req.url);
          }),
        );
      }),
    );
  }

  // Administración (HU-57)
  const detailOrNull = (id: string) => detail(id).pipe(catchError(() => of(null)));

  if (path === '/admin/claims' && req.method === 'GET') {
    const claims = readClaims();
    if (!claims.length) return ok([] as AdminClaim[], req.url);
    const ids = [...new Set(claims.map((c) => c.contratacionId))];
    return forkJoin(ids.map(detailOrNull)).pipe(
      switchMap((details) => {
        const byId = new Map(details.filter((d): d is ContractDetailApi => !!d).map((d) => [d.id, d]));
        return ok(claims.map((c) => adminView(c, byId.get(c.contratacionId) ?? null)).sort((a, b) => b.creado.localeCompare(a.creado)), req.url);
      }),
    );
  }

  m = path.match(/^\/admin\/claims\/(\d+)$/);
  if (m && req.method === 'GET') {
    const claim = readClaims().find((c) => c.id === m![1]);
    if (!claim) return fail(404, 'NOT_FOUND', 'No encontramos el reclamo.', req.url);
    return detailOrNull(claim.contratacionId).pipe(
      switchMap((d) => {
        const data: AdminClaimDetail = {
          ...adminView(claim, d),
          descripcion: claim.descripcion,
          fotos: claim.fotos,
          historial: claimHistory(claim),
          contratacion: {
            id: claim.contratacionId,
            servicio: d?.servicio ?? '—',
            estado: d?.estado ?? 'finalizado',
            fechaHora: d?.fechaHora ?? claim.creado,
            valor: d?.valor ?? 0,
            zona: d ? `${d.zona.barrio}, ${d.zona.comuna}` : '—',
          },
        };
        return ok(data, req.url);
      }),
    );
  }

  m = path.match(/^\/admin\/claims\/(\d+)\/status$/);
  if (m && req.method === 'POST') {
    const body = (req.body ?? {}) as { estado?: ClaimState; resolucion?: string };
    const resolution = String(body.resolucion ?? '').trim();
    const list = readClaims();
    const claim = list.find((c) => c.id === m![1]);
    if (!claim) return fail(404, 'NOT_FOUND', 'No encontramos el reclamo.', req.url);
    const current = claimHistory(claim).at(-1)!.estado;
    if (!body.estado || !CLAIM_TRANSITIONS[current].includes(body.estado)) return fail(409, 'CLAIM_STATE', 'Ese cambio de estado no está permitido.', req.url);
    if (!resolution || resolution.length > MAX_DESCRIPTION) return fail(400, 'RESOLUTION_REQUIRED', 'Escribe la resolución aplicada.', req.url);
    return sessionName(next).pipe(
      switchMap((admin) => {
        claim.historial = [...claimHistory(claim), { estado: body.estado!, fecha: new Date().toISOString(), nota: resolution, admin }];
        writeClaims(list);
        return ok({ id: claim.id, estado: body.estado }, req.url);
      }),
    );
  }

  return next(req);
};

/** Nombre del usuario de la sesión (el administrador que registra un cambio o el prestador que envía). */
export function sessionName(next: (r: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>): Observable<string> {
  return responses(next(new HttpRequest('GET', `${api}/auth/me`, { withCredentials: true }))).pipe(
    map((r) => {
      const u = r.body!.data as { nombres: string; apellidos: string };
      return `${u.nombres} ${u.apellidos}`;
    }),
    catchError(() => of('Administrador')),
  );
}
