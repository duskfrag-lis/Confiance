import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi, PaymentRecord } from '../../features/contracting/models/contract-api.models';
import { ContractAction, ContractStatus } from '../../features/contracting/models/contract';

/**
 * Lo que aún no tiene backend: pagos (E9, PSE con Wompi o transferencia) y calificación (E10).
 * Cancelar, reagendar y reclamar ya van al API real (E11, E12).
 * Las claves viejas que pueda tener el navegador (estado, reagendamientos, cierre) se ignoran.
 */
export interface Overlay {
  pago?: ContractDetailApi['pago'];
  calificacion?: ContractDetailApi['calificacion'];
  /** Fecha en que el pago simulado completó el servicio (finalización confirmada y pago recibido). */
  completado?: string;
}

const KEY = 'confiance.mock.contracts';
const api = environment.apiUrl;
const SIMULATED: ContractAction[] = ['pagar', 'confirmar_transferencia', 'calificar'];

const ACTION_OF: Record<string, ContractAction> = {
  rating: 'calificar',
  'payments/pse': 'pagar',
  'payments/transfer': 'pagar',
  'payments/transfer/confirm': 'confirmar_transferencia',
};

export function readContracts(): Record<string, Overlay> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function writeContracts(store: Record<string, Overlay>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
  
  }
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

/** Las acciones del API, con las de pago y calificación según el estado simulado. */
function actionsFor(d: ContractDetailApi, fromApi: ContractAction[]): ContractAction[] {
  const client = d.rol === 'cliente';
  const list = fromApi.filter((a) => !SIMULATED.includes(a));
  if (d.estado === 'finalizado') {
    if (client && d.pago?.estado === 'pendiente') list.push('pagar');
    if (!client && d.pago?.estado === 'pendiente_confirmacion') list.push('confirmar_transferencia');
  }
  if (d.estado === 'completado' && !d.calificacion) list.push('calificar');
  return list;
}

function apply(d: ContractDetailApi, o: Overlay | undefined): ContractDetailApi {
  const merged: ContractDetailApi = {
    ...d,
    pago: o?.pago !== undefined ? o.pago : d.pago,
    calificacion: o?.calificacion ?? d.calificacion ?? null,
  };
  if (merged.estado === 'finalizado' && merged.finalizacion?.confirmacion && merged.pago?.estado === 'pagado') {
    const at = o?.completado ?? [merged.finalizacion.confirmacion.fecha, merged.pago.fecha ?? ''].sort().at(-1)!;
    merged.etapas = [...d.etapas, { estadoAnterior: 'finalizado', estado: 'completado', fecha: at, actor: 'sistema' }];
    merged.estado = 'completado';
    merged.cierre = { tipo: 'completado' };
    merged.plazo = null;
  }
  merged.acciones = actionsFor(merged, d.acciones);
  return merged;
}

function run(action: string, d: ContractDetailApi, o: Overlay, body: Record<string, unknown>): { overlay: Overlay } | { error: [number, string, string] } {
  const now = new Date().toISOString();
  const next: Overlay = { pago: o.pago, calificacion: o.calificacion, completado: o.completado };

  const maybeComplete = () => {
    if (d.finalizacion?.confirmacion && (next.pago ?? d.pago)?.estado === 'pagado') next.completado = now;
  };

  switch (action) {
    case 'rating':
      next.calificacion = { puntaje: Number(body['puntaje']), comentario: (body['comentario'] as string) || null, fecha: now };
      break;
    case 'payments/pse': {
      // Wompi en modo de pruebas: aprueba, salvo que se pida probar un rechazo
      let rejected = false;
      try {
        rejected = localStorage.getItem('confiance.mock.pseRechazar') === '1';
      } catch {
        rejected = false;
      }
      const pago = next.pago ?? d.pago!;
      next.pago = {
        ...pago,
        estado: rejected ? 'pendiente' : 'pagado',
        metodo: rejected ? null : 'pse',
        fecha: rejected ? null : now,
        intentos: [...pago.intentos, { metodo: 'pse', estado: rejected ? 'rechazado' : 'pagado', monto: d.valor, fecha: now }],
      };
      if (!rejected) maybeComplete();
      break;
    }
    case 'payments/transfer': {
      const pago = next.pago ?? d.pago!;
      next.pago = {
        ...pago,
        estado: 'pendiente_confirmacion',
        metodo: 'transferencia',
        intentos: [...pago.intentos, { metodo: 'transferencia', estado: 'pendiente_confirmacion', monto: d.valor, fecha: now }],
      };
      break;
    }
    case 'payments/transfer/confirm': {
      const received = body['recibida'] === true;
      const pago = next.pago ?? d.pago!;
      const intentos = pago.intentos.map((p, i) =>
        i === pago.intentos.length - 1 ? { ...p, estado: received ? ('pagado' as const) : ('rechazado' as const) } : p,
      );
      next.pago = received
        ? { ...pago, estado: 'pagado', fecha: now, intentos }
        : { ...pago, estado: 'pendiente', metodo: null, intentos };
      if (received) maybeComplete();
      break;
    }
  }
  return { overlay: next };
}

function bodyOf(req: HttpRequest<unknown>): Record<string, unknown> {
  if (req.body instanceof FormData) return Object.fromEntries(req.body.entries());
  return (req.body as Record<string, unknown>) ?? {};
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

  if (path === '/contracts/mine' && req.method === 'GET') {
    return responses(next(req)).pipe(
      map((res) => {
        const store = readContracts();
        const data = (res.body!.data as { id: string; estado: ContractStatus }[]).map((c) =>
          store[c.id]?.completado && c.estado === 'finalizado' ? { ...c, estado: 'completado' as const } : c,
        );
        return res.clone({ body: { ...res.body!, data } });
      }),
    );
  }

  if (path === '/appointments/mine' && req.method === 'GET') {
    return responses(next(req)).pipe(
      map((res) => {
        const store = readContracts();
        const data = (res.body!.data as { contratacionId: string; estado: string; estadoContratacion: string; fechaHora: string }[]).map((a) => {
          const done = store[a.contratacionId]?.completado && a.estadoContratacion === 'finalizado';
          return done ? { ...a, estado: 'completada', estadoContratacion: 'completado' } : a;
        });
        return res.clone({ body: { ...res.body!, data } });
      }),
    );
  }

  if (path === '/payments/mine' && req.method === 'GET') {
    const mine = new HttpRequest('GET', `${api}/contracts/mine`, { withCredentials: true });
    return responses(next(mine)).pipe(
      switchMap((res) => {
        const store = readContracts();
        const ids = (res.body!.data as { id: string; estado: ContractStatus }[])
          .filter((c) => ['finalizado', 'completado'].includes(c.estado))
          .map((c) => c.id);
        if (!ids.length) return ok([] as PaymentRecord[], req.url);
        const details = ids.map((id) =>
          responses(next(new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true }))).pipe(
            map((r) => apply(r.body!.data as ContractDetailApi, store[id])),
          ),
        );
        return forkJoin(details).pipe(
          switchMap((list) =>
            ok(
              list
                .filter((d) => d.pago)
                .map(
                  (d): PaymentRecord => ({
                    contratacionId: d.id,
                    servicio: d.servicio,
                    contraparte: d.rol === 'cliente' ? { nombre: d.prestador.nombre, fotoUrl: d.prestador.fotoUrl } : d.cliente,
                    monto: d.pago!.monto,
                    estado: d.pago!.estado,
                    metodo: d.pago!.metodo,
                    finalizada: d.finalizacion?.solicitada ?? d.fechaHora,
                    fecha: d.pago!.fecha,
                    intentosRechazados: d.pago!.intentos.filter((i) => i.estado === 'rechazado').length,
                  }),
                )
                .sort((a, b) => (b.fecha ?? b.finalizada).localeCompare(a.fecha ?? a.finalizada)),
              req.url,
            ),
          ),
        );
      }),
    );
  }

  m = path.match(/^\/contracts\/(\d+)\/(rating|payments\/pse|payments\/transfer\/confirm|payments\/transfer)$/);
  if (m && req.method === 'POST') {
    const [, id, action] = m;
    const body = bodyOf(req);
    const detail = new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true });
    return responses(next(detail)).pipe(
      switchMap((res) => {
        const store = readContracts();
        const overlay = store[id] ?? {};
        const current = apply(res.body!.data as ContractDetailApi, store[id]);
        if (!current.acciones.includes(ACTION_OF[action])) {
          return fail(409, 'REQUEST_STATE', 'Esta contratación cambió de estado; vuelve a cargarla.', req.url);
        }
        const result = run(action, current, overlay, body);
        if ('error' in result) return fail(result.error[0], result.error[1], result.error[2], req.url);
        store[id] = result.overlay;
        writeContracts(store);
        const updated = apply(res.body!.data as ContractDetailApi, result.overlay);
        const data =
          action === 'payments/pse'
            ? { aprobado: updated.pago?.estado === 'pagado' }
            : { id, estado: updated.estado, fechaHora: updated.fechaHora, valor: updated.valor };
        return ok(data, req.url);
      }),
    );
  }

  return next(req);
};
