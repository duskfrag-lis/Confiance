import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, filter, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DocumentType,
  MAX_INFO,
  MAX_NUMBER,
  MAX_PHOTOS,
  VerificationApi,
  VerificationRequest,
} from '../../features/verification/models/verification.models';
import { shrinkPhoto } from './claims-mock.interceptor';

// Simula la verificación de identidad de la E13 (HU-55) mientras el backend no la tenga (mockApi).
// Según la HU, hasta que exista la revisión del administrador (HU-58) la solicitud se queda en "pendiente".
// Para probar los otros estados: localStorage 'confiance.mock.verificacionResultado' = 'aprobada' | 'rechazada' | 'correccion'
// y la solicitud pendiente toma ese resultado un minuto después de enviada.

interface Stored {
  id: string;
  tipoDocumento: string;
  numero: string;
  fotos: string[];
  informacion: string | null;
  enviada: string;
  resultado?: 'rechazada' | 'correccion';
}

const KEY = 'confiance.mock.verification';
const RESULT_KEY = 'confiance.mock.verificacionResultado';
const REVIEW_MS = 60_000;
const api = environment.apiUrl;

// La base de datos aún solo tiene 'cedula'; el resto se propone para el catálogo
const DOCUMENT_TYPES: DocumentType[] = [
  { id: 'cedula', nombre: 'Cédula de ciudadanía' },
  { id: 'cedula_extranjeria', nombre: 'Cédula de extranjería' },
  { id: 'ppt', nombre: 'Permiso por Protección Temporal (PPT)' },
  { id: 'pasaporte', nombre: 'Pasaporte' },
];

const REASONS = {
  rechazada: 'La foto del reverso no es legible.',
  correccion: 'Falta la foto del reverso del documento.',
};

function read(): Stored[] {
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

function result(): 'aprobada' | 'rechazada' | 'correccion' | null {
  try {
    const value = localStorage.getItem(RESULT_KEY);
    return value === 'aprobada' || value === 'rechazada' || value === 'correccion' ? value : null;
  } catch {
    return null;
  }
}

/** Cada solicitud con su estado; las anteriores a la última ya tuvieron resultado. */
function toRequest(s: Stored, latest: boolean, now = Date.now()): VerificationRequest {
  const type = DOCUMENT_TYPES.find((t) => t.id === s.tipoDocumento) ?? DOCUMENT_TYPES[0];
  const reviewedAt = new Date(new Date(s.enviada).getTime() + REVIEW_MS);
  const outcome = latest ? (now >= reviewedAt.getTime() ? result() : null) : (s.resultado ?? 'rechazada');
  return {
    id: s.id,
    tipoDocumento: type,
    numero: s.numero,
    fotos: s.fotos,
    informacion: s.informacion,
    estado: outcome ?? 'pendiente',
    enviada: s.enviada,
    revisada: outcome ? reviewedAt.toISOString() : null,
    motivo: outcome === 'rechazada' || outcome === 'correccion' ? REASONS[outcome] : null,
  };
}

export function verificationView(): VerificationApi {
  const list = read();
  const requests = list.map((s, i) => toRequest(s, i === list.length - 1)).reverse();
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
    return from(Promise.all(photos.map(shrinkPhoto))).pipe(
      switchMap((fotos) => {
        const list = read();
        const last = list.at(-1);
        if (last && (state === 'rechazada' || state === 'correccion')) last.resultado = state;
        write([...list, { id: String(Date.now()), tipoDocumento: type, numero: number, fotos, informacion: info || null, enviada: new Date().toISOString() }]);
        return ok(verificationView(), req.url);
      }),
    );
  }

  return next(req);
};
