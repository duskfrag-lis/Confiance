import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, filter, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractDetailApi, PaymentRecord } from '../../features/contracting/models/contract-api.models';
import { ContractAction, ContractStatus } from '../../features/contracting/models/contract';

type Role = 'cliente' | 'prestador';
type Stage = ContractDetailApi['etapas'][number];
type Reschedule = ContractDetailApi['reagendamientos'][number];

interface Overlay {
  estado?: ContractStatus;
  fechaHora?: string;
  etapas: Stage[];
  reagendamientos: Reschedule[];
  pago?: ContractDetailApi['pago'];
  cierre?: ContractDetailApi['cierre'];
  calificacion?: ContractDetailApi['calificacion'];
}

const KEY = 'confiance.mock.contracts';
const HOUR = 3_600_000;
const api = environment.apiUrl;

const ACTION_OF: Record<string, ContractAction> = {
  reschedule: 'reagendar',
  'reschedule/respond': 'responder_reagendamiento',
  rating: 'calificar',
  'payments/pse': 'pagar',
  'payments/transfer': 'pagar',
  'payments/transfer/confirm': 'confirmar_transferencia',
};

function read(): Record<string, Overlay> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function write(store: Record<string, Overlay>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
  
  }
}

const ok = <T>(data: T, url: string) => of(new HttpResponse({ status: 200, url, body: { success: true, data } }));

const fail = (status: number, code: string, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, url, error: { success: false, statusCode: status, message: { code, message } } }));

function actionsFor(d: ContractDetailApi, now = Date.now()): ContractAction[] {
  const client = d.rol === 'cliente';
  const list: ContractAction[] = [];
  const add = (a: ContractAction, when = true) => when && list.push(a);
  const early = new Date(d.fechaHora).getTime() - now > 24 * HOUR;
  const pending = d.reagendamientos.find((r) => r.estado === 'pendiente');
  const canReschedule = !pending && d.reagendamientos.length < 2;
  const answer = !!pending && pending.pedidoPor !== d.rol;

  switch (d.estado) {
    case 'solicitado':
      add('aceptar', !client);
      add('rechazar', !client);
      add('cancelar', early);
      add('cancelar_fuerza_mayor');
      break;
    case 'aceptado':
      add('confirmar', client);
      add('cancelar', early);
      add('cancelar_fuerza_mayor');
      add('reagendar', canReschedule);
      add('responder_reagendamiento', answer);
      break;
    case 'confirmado':
      add('iniciar', !client);
      add('cancelar', early);
      add('cancelar_fuerza_mayor');
      add('reagendar', canReschedule);
      add('responder_reagendamiento', answer);
      break;
    case 'en_curso':
      add('finalizar', !client);
      add('cancelar_fuerza_mayor');
      break;
    case 'finalizado':
      if (client) {
        add('confirmar_finalizacion', !d.finalizacion?.confirmacion);
        add('pagar', d.pago?.estado === 'pendiente');
      } else {
        add('confirmar_transferencia', d.pago?.estado === 'pendiente_confirmacion');
      }
      add('reportar');
      add('reclamar');
      break;
    case 'completado':
      add('calificar', !d.calificacion);
      add('reportar');
      add('reclamar');
      break;
  }
  return list;
}

function apply(d: ContractDetailApi, o: Overlay | undefined): ContractDetailApi {
  if (!o) return d;
  const merged: ContractDetailApi = {
    ...d,
    estado: o.estado ?? d.estado,
    fechaHora: o.fechaHora ?? d.fechaHora,
    etapas: [...d.etapas, ...o.etapas],
    reagendamientos: [...d.reagendamientos, ...o.reagendamientos],
    pago: o.pago !== undefined ? o.pago : d.pago,
    cierre: o.cierre !== undefined ? o.cierre : d.cierre,
    calificacion: o.calificacion ?? d.calificacion ?? null,
  };
  
  if (merged.estado === 'finalizado' && merged.finalizacion?.confirmacion && merged.pago?.estado === 'pagado') {
    const at = [merged.finalizacion.confirmacion.fecha, merged.pago.fecha ?? ''].sort().at(-1)!;
    merged.etapas = [...merged.etapas, { estadoAnterior: 'finalizado', estado: 'completado', fecha: at, actor: 'sistema' }];
    merged.estado = 'completado';
    merged.cierre = { tipo: 'completado' };
  }
  merged.plazo = merged.estado === d.estado ? d.plazo : null;
  merged.acciones = actionsFor(merged);
  return merged;
}

function run(action: string, d: ContractDetailApi, o: Overlay, body: Record<string, unknown>): { overlay: Overlay } | { error: [number, string, string] } {
  const now = new Date().toISOString();
  const role = d.rol as Role;
  const stage = (estado: ContractStatus, actor: Role | 'sistema' = role): Stage => ({ estadoAnterior: o.estado ?? d.estado, estado, fecha: now, actor });
  const next: Overlay = { ...o, etapas: [...o.etapas], reagendamientos: [...o.reagendamientos] };

  const maybeComplete = () => {
    const conf = d.finalizacion?.confirmacion;
    const paid = (next.pago ?? d.pago)?.estado === 'pagado';
    if (conf && paid) {
      next.etapas.push({ estadoAnterior: 'finalizado', estado: 'completado', fecha: now, actor: 'sistema' });
      next.estado = 'completado';
      next.cierre = { tipo: 'completado' };
    }
  };

  switch (action) {
    case 'cancel': {
      const forceMajeure = body['fuerzaMayor'] === true || body['fuerzaMayor'] === 'true';
      const early = new Date(next.fechaHora ?? d.fechaHora).getTime() - Date.now() > 24 * HOUR;
      if (!forceMajeure && !early) return { error: [409, 'CANCEL_NOTICE', 'Faltan 24 horas o menos: solo puedes cancelar por fuerza mayor.'] };
      next.etapas.push(stage('cancelado'));
      next.estado = 'cancelado';
      next.cierre = {
        tipo: 'cancelado',
        por: role,
        motivo: String(body['motivo'] ?? ''),
        automatica: false,
        fuerzaMayor: forceMajeure ? { evaluacion: 'pendiente' } : null,
        fecha: now,
      };
      break;
    }
    case 'reschedule':
      next.reagendamientos.push({
        fechaAnterior: next.fechaHora ?? d.fechaHora,
        fechaNueva: String(body['fechaHora']),
        pedidoPor: role,
        estado: 'pendiente',
        creado: now,
      });
      break;
    case 'reschedule/respond': {
      const i = next.reagendamientos.findIndex((r) => r.estado === 'pendiente');
      if (i < 0) return { error: [409, 'REQUEST_STATE', 'No hay un reagendamiento pendiente.'] };
      const accept = body['aceptar'] === true;
      next.reagendamientos[i] = { ...next.reagendamientos[i], estado: accept ? 'aceptado' : 'rechazado' };
      if (accept) next.fechaHora = next.reagendamientos[i].fechaNueva;
      break;
    }
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
    return responses(next(req)).pipe(map((res) => res.clone({ body: { ...res.body!, data: apply(res.body!.data as ContractDetailApi, read()[id]) } })));
  }

  if (path === '/contracts/mine' && req.method === 'GET') {
    return responses(next(req)).pipe(
      map((res) => {
        const store = read();
        const data = (res.body!.data as { id: string; estado: ContractStatus; fechaHora: string }[]).map((c) =>
          store[c.id] ? { ...c, estado: store[c.id].estado ?? c.estado, fechaHora: store[c.id].fechaHora ?? c.fechaHora } : c,
        );
        return res.clone({ body: { ...res.body!, data } });
      }),
    );
  }

  if (path === '/appointments/mine' && req.method === 'GET') {
    const STATE: Partial<Record<ContractStatus, string>> = { en_curso: 'en_curso', finalizado: 'completada', completado: 'completada', cancelado: 'cancelada' };
    return responses(next(req)).pipe(
      map((res) => {
        const store = read();
        const data = (res.body!.data as { contratacionId: string; estado: string; estadoContratacion: string; fechaHora: string }[]).map((a) => {
          const o = store[a.contratacionId];
          if (!o) return a;
          return {
            ...a,
            fechaHora: o.fechaHora ?? a.fechaHora,
            estado: (o.estado && STATE[o.estado]) ?? a.estado,
            estadoContratacion: o.estado ?? a.estadoContratacion,
          };
        });
        return res.clone({ body: { ...res.body!, data } });
      }),
    );
  }

  if (path === '/payments/mine' && req.method === 'GET') {
    const mine = new HttpRequest('GET', `${api}/contracts/mine`, { withCredentials: true });
    return responses(next(mine)).pipe(
      switchMap((res) => {
        const store = read();
        const ids = (res.body!.data as { id: string; estado: ContractStatus }[])
          .filter((c) => ['finalizado', 'completado'].includes(store[c.id]?.estado ?? c.estado))
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

  m = path.match(/^\/contracts\/(\d+)\/(cancel|reschedule\/respond|reschedule|rating|payments\/pse|payments\/transfer\/confirm|payments\/transfer)$/);
  if (m && req.method === 'POST') {
    const [, id, action] = m;
    const body = bodyOf(req);
    const detail = new HttpRequest('GET', `${api}/contracts/${id}`, { withCredentials: true });
    return responses(next(detail)).pipe(
      switchMap((res) => {
        const store = read();
        const overlay = store[id] ?? { etapas: [], reagendamientos: [] };
        const current = apply(res.body!.data as ContractDetailApi, store[id]);
        const wanted: ContractAction =
          action === 'cancel' ? (body['fuerzaMayor'] === true || body['fuerzaMayor'] === 'true' ? 'cancelar_fuerza_mayor' : 'cancelar') : ACTION_OF[action];
        if (!current.acciones.includes(wanted)) {
          if (wanted === 'cancelar' && current.acciones.includes('cancelar_fuerza_mayor')) {
            return fail(409, 'CANCEL_NOTICE', 'Faltan 24 horas o menos: solo puedes cancelar por fuerza mayor.', req.url);
          }
          return fail(409, 'REQUEST_STATE', 'Esta contratación cambió de estado; vuelve a cargarla.', req.url);
        }
        const result = run(action, current, overlay, body);
        if ('error' in result) return fail(result.error[0], result.error[1], result.error[2], req.url);
        store[id] = result.overlay;
        write(store);
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
