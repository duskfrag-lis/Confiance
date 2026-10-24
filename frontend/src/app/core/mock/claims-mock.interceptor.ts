import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi } from '../../features/contracting/models/contract-api.models';
import { ClaimApi, ClaimReason, ClaimState, MAX_DESCRIPTION, MAX_PHOTOS, REASONS } from '../../features/claims/models/claim.models';

// Simula los reclamos de la E12 (HU-54) mientras el backend no los tenga (mockApi).
// Como aún no existe el panel del administrador, el reclamo pasa solo a "en revisión" al minuto y se resuelve a los 5 minutos.

type Role = 'cliente' | 'prestador';

export interface StoredClaim {
  id: string;
  contratacionId: string;
  motivo: ClaimReason;
  descripcion: string;
  creado: string;
  iniciadoPor: Role;
  fotos: string[];
}

export const CLAIMS_KEY = 'confiance.mock.claims';
const REVIEW_MS = 60_000;
const RESOLVE_MS = 5 * 60_000;
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

function writeClaims(list: StoredClaim[]): void {
  try {
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(list));
  } catch {
    // Sin espacio (fotos grandes) el reclamo se guarda sin persistir; se pierde al recargar
  }
}

/** Historial simulado según el tiempo transcurrido desde la creación. */
export function claimHistory(c: StoredClaim, now = Date.now()): { estado: ClaimState; fecha: string }[] {
  const created = new Date(c.creado).getTime();
  const steps: { estado: ClaimState; fecha: string }[] = [{ estado: 'abierto', fecha: c.creado }];
  if (now - created >= REVIEW_MS) steps.push({ estado: 'en_revision', fecha: new Date(created + REVIEW_MS).toISOString() });
  if (now - created >= RESOLVE_MS) steps.push({ estado: 'resuelto', fecha: new Date(created + RESOLVE_MS).toISOString() });
  return steps;
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
    historial: history,
    resolucion:
      last.estado === 'resuelto'
        ? { texto: 'El equipo de Confiance revisó la descripción y las evidencias, habló con ambas partes y registró la resolución en la contratación.', fecha: last.fecha }
        : null,
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
        if (list.some((c) => c.contratacionId === id && c.iniciadoPor === role && claimHistory(c).at(-1)!.estado !== 'resuelto')) {
          return fail(409, 'CLAIM_EXISTS', 'Ya tienes un reclamo en curso sobre esta contratación.', req.url);
        }
        return from(Promise.all(photos.map(shrinkPhoto))).pipe(
          switchMap((fotos) => {
            const next = String(Math.max(FIRST_ID - 1, ...list.map((c) => Number(c.id))) + 1);
            const claim: StoredClaim = { id: next, contratacionId: id, motivo: reason, descripcion: description, creado: new Date().toISOString(), iniciadoPor: role, fotos };
            writeClaims([...list, claim]);
            return ok(view(claim, d), req.url);
          }),
        );
      }),
    );
  }

  return next(req);
};
