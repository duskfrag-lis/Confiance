import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, unwrap } from '../../../core/api/api';
import {
  ContractDetailApi,
  ContractListItem,
  ContractSummary,
  CreateRequestInput,
  NewRequestData,
  PaymentRecord,
} from '../models/contract-api.models';
import {
  Actor,
  ClientContract,
  Contract,
  ContractCore,
  ContractEvent,
  ContractParty,
  ContractStatus,
  FLOW,
  PaymentAttempt,
} from '../models/contract';

const api = `${environment.apiUrl}/contracts`;

const DEADLINE_KIND = {
  respuesta_prestador: 'respond',
  confirmacion_cliente: 'client_confirm',
  confirmacion_finalizacion: 'completion',
} as const;

const ATTEMPT_STATUS = {
  pendiente: 'pending',
  rechazado: 'rejected',
  pendiente_confirmacion: 'pending_confirmation',
  pagado: 'paid',
} as const;

const STAGE_LABEL: Record<ContractStatus, (mine: boolean) => string> = {
  solicitado: (mine) => (mine ? 'Enviaste la solicitud' : 'Envió la solicitud'),
  aceptado: (mine) => (mine ? 'Aceptaste la solicitud' : 'Aceptó la solicitud'),
  rechazado: (mine) => (mine ? 'Rechazaste la solicitud' : 'Rechazó la solicitud'),
  confirmado: (mine) => (mine ? 'Confirmaste la contratación' : 'Confirmó la contratación'),
  en_curso: (mine) => (mine ? 'Iniciaste el servicio' : 'Inició el servicio'),
  finalizado: (mine) => (mine ? 'Marcaste el servicio como finalizado' : 'Marcó el servicio como finalizado'),
  completado: () => 'La contratación quedó completada',
  cancelado: (mine) => (mine ? 'Cancelaste la contratación' : 'Canceló la contratación'),
};

const toActor = (role: string): Actor => (role === 'cliente' ? 'client' : role === 'prestador' ? 'provider' : 'system');

const party = (p: { nombre: string; fotoUrl: string | null }, id = ''): ContractParty => ({
  id,
  name: p.nombre,
  photoUrl: p.fotoUrl,
  rating: null,
  ratingCount: 0,
});

@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly http = inject(HttpClient);

  newRequest(listingId: string): Observable<NewRequestData> {
    return this.http.get<ApiResponse<NewRequestData>>(`${api}/new/${listingId}`).pipe(unwrap());
  }

  create(input: CreateRequestInput): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(api, input).pipe(unwrap());
  }

  mine(): Observable<ContractListItem[]> {
    return this.http.get<ApiResponse<ContractListItem[]>>(`${api}/mine`, { params: new HttpParams() }).pipe(unwrap());
  }

  providerList(): Observable<Contract[]> {
    return this.mine().pipe(map((list) => list.map((c) => ({ ...fromListItem(c), client: party(c.cliente ?? { nombre: '—', fotoUrl: null }) }))));
  }

  clientList(): Observable<ClientContract[]> {
    return this.mine().pipe(
      map((list) =>
        list.map((c) => {
          const p = c.prestador ?? { id: '', nombre: '—', fotoUrl: null };
          return { ...fromListItem(c), provider: { ...party(p, p.id), profileId: p.id, verified: false }, bankAccount: null };
        }),
      ),
    );
  }

  detail(id: string): Observable<ContractDetailApi> {
    return this.http.get<ApiResponse<ContractDetailApi>>(`${api}/${id}`).pipe(unwrap());
  }

  providerDetail(id: string): Observable<Contract> {
    return this.detail(id).pipe(map((d) => ({ ...core(d), client: party(d.cliente) })));
  }

  clientDetail(id: string): Observable<ClientContract> {
    return this.detail(id).pipe(
      map((d) => ({
        ...core(d),
        provider: { ...party(d.prestador, d.prestador.id), profileId: d.prestador.id, verified: false },
        bankAccount: d.datosBancarios
          ? { bank: d.datosBancarios.banco, type: d.datosBancarios.tipoCuenta === 'ahorros' ? 'Ahorros' : 'Corriente', number: d.datosBancarios.numero }
          : null,
      })),
    );
  }

  accept(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/accept`, {}).pipe(unwrap());
  }

  reject(id: string, reason: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/reject`, reason ? { motivo: reason } : {}).pipe(unwrap());
  }

  confirm(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/confirm`, {}).pipe(unwrap());
  }

  start(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/start`, {}).pipe(unwrap());
  }

  finish(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/finish`, {}).pipe(unwrap());
  }

  confirmCompletion(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/confirm-completion`, {}).pipe(unwrap());
  }

  report(id: string, description: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/report`, { descripcion: description }).pipe(unwrap());
  }

  cancel(id: string, reason: string, forceMajeure: boolean, evidence: File | null): Observable<ContractSummary> {
    const form = new FormData();
    form.append('motivo', reason);
    form.append('fuerzaMayor', String(forceMajeure));
    if (evidence) form.append('evidencia', evidence);
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/cancel`, form).pipe(unwrap());
  }

  reschedule(id: string, date: Date): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/reschedule`, { fechaHora: date.toISOString() }).pipe(unwrap());
  }

  answerReschedule(id: string, accept: boolean): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/reschedule/respond`, { aceptar: accept }).pipe(unwrap());
  }

  payPse(id: string): Observable<boolean> {
    return this.http.post<ApiResponse<{ aprobado: boolean }>>(`${api}/${id}/payments/pse`, {}).pipe(unwrap(), map((r) => r.aprobado));
  }

  markTransfer(id: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/payments/transfer`, {}).pipe(unwrap());
  }

  confirmTransfer(id: string, received: boolean): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/payments/transfer/confirm`, { recibida: received }).pipe(unwrap());
  }

  payments(): Observable<PaymentRecord[]> {
    return this.http.get<ApiResponse<PaymentRecord[]>>(`${environment.apiUrl}/payments/mine`).pipe(unwrap());
  }

  rate(id: string, score: number, comment: string): Observable<ContractSummary> {
    return this.http.post<ApiResponse<ContractSummary>>(`${api}/${id}/rating`, { puntaje: score, comentario: comment || null }).pipe(unwrap());
  }
}

function fromListItem(c: ContractListItem): ContractCore {
  const at = new Date(c.fechaHora);
  return {
    id: c.id,
    service: c.servicio,
    origin: 'listing',
    status: c.estado,
    createdAt: at,
    acceptedAt: null,
    scheduledAt: at,
    commune: '',
    neighborhood: '',
    address: '',
    price: c.valor,
    rejectionReason: null,
    cancellation: null,
    completionRequestedAt: null,
    clientCompletion: null,
    issueReported: false,
    payments: [],
    reschedules: [],
    myRating: null,
    events: [],
    reached: c.estado,
    deadline: null,
    actions: [],
  };
}

function core(d: ContractDetailApi): ContractCore {
  const mine = d.rol === 'cliente' ? 'cliente' : 'prestador';
  const events: ContractEvent[] = d.etapas.map((e) => ({
    at: new Date(e.fecha),
    label: e.actor === 'sistema' && e.estado === 'cancelado' ? 'Se canceló automáticamente por plazo vencido' : STAGE_LABEL[e.estado](e.actor === mine),
    actor: toActor(e.actor),
  }));
  
  const reached = FLOW.filter((s) => s === d.estado || d.etapas.some((e) => e.estado === s)).pop() ?? 'solicitado';
  const closing = d.cierre;

  return {
    id: d.id,
    service: d.servicio,
    origin: d.origen.tipo === 'publicacion' ? 'listing' : 'need',
    status: d.estado,
    createdAt: new Date(d.creada),
    acceptedAt: d.etapas.find((e) => e.estado === 'aceptado') ? new Date(d.etapas.find((e) => e.estado === 'aceptado')!.fecha) : null,
    scheduledAt: new Date(d.fechaHora),
    commune: d.zona.comuna,
    neighborhood: d.zona.barrio,
    address: d.direccion ?? '',
    price: d.valor,
    rejectionReason: closing?.tipo === 'rechazado' ? closing.motivo : null,
    cancellation:
      closing?.tipo === 'cancelado'
        ? {
            by: toActor(closing.por),
            kind: closing.automatica ? 'automatic' : closing.fuerzaMayor ? 'force_majeure' : 'ordinary',
            reason: closing.motivo,
            at: new Date(closing.fecha),
          }
        : null,
    completionRequestedAt: d.finalizacion ? new Date(d.finalizacion.solicitada) : null,
    clientCompletion: d.finalizacion?.confirmacion
      ? { at: new Date(d.finalizacion.confirmacion.fecha), automatic: d.finalizacion.confirmacion.automatica }
      : null,
    issueReported: !!d.reporte,
    payments: (d.pago?.intentos ?? []).map(
      (p, i): PaymentAttempt => ({
        id: String(i),
        method: p.metodo === 'transferencia' ? 'bank_transfer' : 'pse',
        status: ATTEMPT_STATUS[p.estado],
        at: new Date(p.fecha),
      }),
    ),
    reschedules: d.reagendamientos.map((r, i) => ({
      id: String(i),
      requestedBy: r.pedidoPor === 'cliente' ? 'client' : 'provider',
      previous: new Date(r.fechaAnterior),
      proposed: new Date(r.fechaNueva),
      status: r.estado === 'pendiente' ? 'pending' : r.estado === 'aceptado' ? 'accepted' : 'rejected',
      at: new Date(r.creado),
    })),
    myRating: d.calificacion ? { score: d.calificacion.puntaje, comment: d.calificacion.comentario ?? '' } : null,
    events,
    reached,
    deadline: d.plazo ? { kind: DEADLINE_KIND[d.plazo.tipo], at: new Date(d.plazo.hasta) } : null,
    actions: d.acciones,
  };
}
