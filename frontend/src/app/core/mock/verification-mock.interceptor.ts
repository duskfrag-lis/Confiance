import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, filter, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DocumentType,
  MAX_INFO,
  MAX_NUMBER,
  MAX_PHOTOS,
  VerificationApi,
  VerificationRequest,
} from '../../features/verification/models/verification.models';
import { AdminVerification, VerificationDecision } from '../../features/admin/models/admin.models';
import { sessionName, shrinkPhoto } from './claims-mock.interceptor';

// Simula la verificación de identidad (HU-55) y su revisión por el administrador (HU-58) mientras el backend no las tenga (mockApi).

export interface Stored {
  id: string;
  tipoDocumento: string;
  numero: string;
  fotos: string[];
  informacion: string | null;
  enviada: string;
  prestador?: { nombre: string; fotoUrl: string | null };
  estado?: VerificationDecision;
  motivo?: string | null;
  revisada?: string;
  admin?: string;
}

const KEY = 'confiance.mock.verification';
const api = environment.apiUrl;

// Igual que el catálogo de la base de datos y el registro: por ahora solo cédula
const DOCUMENT_TYPES: DocumentType[] = [{ id: 'cedula', nombre: 'Cédula de ciudadanía' }];

export function readVerifications(): Stored[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function write(list: Stored[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sin espacio la solicitud no persiste; se pierde al recargar
  }
}

function toRequest(s: Stored): VerificationRequest {
  return {
    id: s.id,
    tipoDocumento: DOCUMENT_TYPES.find((t) => t.id === s.tipoDocumento) ?? DOCUMENT_TYPES[0],
    numero: s.numero,
    fotos: s.fotos,
    informacion: s.informacion,
    estado: s.estado ?? 'pendiente',
    enviada: s.enviada,
    revisada: s.revisada ?? null,
    motivo: s.motivo ?? null,
  };
}

export function verificationView(): VerificationApi {
  const list = readVerifications();
  const requests = list.map(toRequest).reverse();
  const [actual = null, ...anteriores] = requests;
  return { estado: actual?.estado ?? 'sin_enviar', actual, anteriores };
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

const responses = (events: Observable<HttpEvent<unknown>>) =>
  events.pipe(filter((e): e is HttpResponse<{ success: boolean; data: unknown }> => e instanceof HttpResponse));

export const verificationMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockApi || !req.url.startsWith(api)) return next(req);
  const path = req.url.slice(api.length).split('?')[0];

  if (path === '/verification/document-types' && req.method === 'GET') return ok(DOCUMENT_TYPES, req.url);
  if (path === '/verification/mine' && req.method === 'GET') return ok(verificationView(), req.url);

  // El perfil del prestador muestra el estado de su verificación
  if (path === '/profiles/provider' && req.method === 'GET') {
    return responses(next(req)).pipe(
      map((res) => {
        const estado = verificationView().estado;
        return res.clone({ body: { ...res.body!, data: { ...(res.body!.data as object), verificacion: estado === 'sin_enviar' ? null : estado } } });
      }),
    );
  }

  if (path === '/verification' && req.method === 'POST') {
    const body = req.body as FormData;
    const type = String(body.get('tipoDocumento') ?? '');
    const number = String(body.get('numero') ?? '').trim();
    const info = String(body.get('informacion') ?? '').trim();
    const photos = body.getAll('fotos').filter((f): f is File => f instanceof File);
    const state = verificationView().estado;
    if (state === 'pendiente') return fail(409, 'VERIFICATION_PENDING', 'Ya tienes una solicitud pendiente.', req.url);
    if (state === 'aprobada') return fail(409, 'ALREADY_VERIFIED', 'Tu identidad ya está verificada.', req.url);
    if (!DOCUMENT_TYPES.some((t) => t.id === type) || !number || number.length > MAX_NUMBER || !photos.length || photos.length > MAX_PHOTOS || info.length > MAX_INFO) {
      return fail(400, 'VALIDATION_ERROR', 'Revisa el documento, el número y las fotos.', req.url);
    }
    return forkJoin([from(Promise.all(photos.map(shrinkPhoto))), sessionName(next)]).pipe(
      switchMap(([fotos, name]) => {
        write([...readVerifications(), { id: String(Date.now()), tipoDocumento: type, numero: number, fotos, informacion: info || null, enviada: new Date().toISOString(), prestador: { nombre: name, fotoUrl: null } }]);
        return ok(verificationView(), req.url);
      }),
    );
  }

  // Administración (HU-58): pendientes de la más antigua a la más reciente
  if (path === '/admin/verifications' && req.method === 'GET') {
    const list = readVerifications();
    const pending = list
      .filter((s) => !s.estado)
      .map(
        (s): AdminVerification => ({
          ...toRequest(s),
          prestador: s.prestador ?? { nombre: 'Prestador', fotoUrl: null },
          anteriores: list.filter((x) => x !== s && x.estado).length,
        }),
      )
      .sort((a, b) => a.enviada.localeCompare(b.enviada));
    return ok(pending, req.url);
  }

  const m = path.match(/^\/admin\/verifications\/(\d+)\/review$/);
  if (m && req.method === 'POST') {
    const body = (req.body ?? {}) as { decision?: VerificationDecision; motivo?: string };
    const reason = String(body.motivo ?? '').trim();
    const list = readVerifications();
    const target = list.find((s) => s.id === m[1]);
    if (!target) return fail(404, 'NOT_FOUND', 'No encontramos la solicitud.', req.url);
    if (target.estado) return fail(409, 'ALREADY_REVIEWED', 'Esta solicitud ya fue revisada.', req.url);
    if (!body.decision || !['aprobada', 'rechazada', 'correccion'].includes(body.decision)) return fail(400, 'VALIDATION_ERROR', 'Elige una decisión.', req.url);
    if (body.decision !== 'aprobada' && (!reason || reason.length > MAX_INFO)) return fail(400, 'REASON_REQUIRED', 'Escribe el motivo.', req.url);
    return sessionName(next).pipe(
      switchMap((admin) => {
        Object.assign(target, { estado: body.decision, motivo: body.decision === 'aprobada' ? null : reason, revisada: new Date().toISOString(), admin });
        write(list);
        return ok({ id: target.id, estado: body.decision }, req.url);
      }),
    );
  }

  return next(req);
};
