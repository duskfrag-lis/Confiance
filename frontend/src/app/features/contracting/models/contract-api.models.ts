import { BlockKey } from '../../profiles/models/profiles.models';
import { ContractAction, ContractStatus } from './contract';

export interface NewRequestData {
  publicacion: { id: string; titulo: string; precioMin: number; precioMax: number; precioFijo: boolean };
  prestador: { id: string; nombre: string };
  zona: { barrioId: string; barrio: string; comunaId: string; comuna: string } | null;
  direccion: string | null;
  horarios: { fecha: string; bloque: BlockKey; inicio: string; fin: string }[];
}

export interface CreateRequestInput {
  publicacionId: string;
  fechaHora: string;
  barrioId: string;
  direccion: string;
  valor: number;
}

export interface ContractSummary {
  id: string;
  estado: ContractStatus;
  fechaHora: string;
  valor: number;
}

type Role = 'cliente' | 'prestador' | 'sistema' | 'administrador';
interface ApiPerson {
  nombre: string;
  fotoUrl: string | null;
}

export interface ContractListItem {
  id: string;
  servicio: string;
  estado: ContractStatus;
  fechaHora: string;
  valor: number;
  prestador?: ApiPerson & { id: string };
  cliente?: ApiPerson;
}

export interface ContractDetailApi {
  id: string;
  servicio: string;
  estado: ContractStatus;
  fechaHora: string;
  valor: number;
  rol: 'cliente' | 'prestador';
  origen: { tipo: 'publicacion' | 'necesidad'; id: string };
  cliente: ApiPerson;
  prestador: ApiPerson & { id: string };
  bloque: BlockKey | null;
  zona: { barrioId: string; barrio: string; comunaId: string; comuna: string };
  direccion: string | null;
  creada: string;
  plazo: { tipo: 'respuesta_prestador' | 'confirmacion_cliente' | 'confirmacion_finalizacion'; hasta: string } | null;
  etapas: { estadoAnterior: ContractStatus | null; estado: ContractStatus; fecha: string; actor: Role }[];
  reagendamientos: { fechaAnterior: string; fechaNueva: string; pedidoPor: Role; estado: 'pendiente' | 'aceptado' | 'rechazado'; creado: string }[];
  finalizacion: { solicitada: string; confirmacion: { fecha: string; automatica: boolean } | null } | null;
  pago: {
    estado: 'pendiente' | 'en_proceso' | 'pendiente_confirmacion' | 'pagado';
    metodo: 'pse' | 'transferencia' | null;
    monto: number;
    fecha: string | null;
    intentos: { metodo: 'pse' | 'transferencia' | null; estado: 'pendiente' | 'rechazado' | 'pendiente_confirmacion' | 'pagado'; monto: number; fecha: string }[];
  } | null;
  datosBancarios?: { banco: string; tipoCuenta: 'ahorros' | 'corriente'; numero: string } | null;
  cierre:
    | { tipo: 'completado' }
    | { tipo: 'rechazado'; motivo: string | null }
    | { tipo: 'cancelado'; por: Role; motivo: string; automatica: boolean; fuerzaMayor: { evaluacion: string; evidencia?: string | null; fecha?: string; admin?: string } | null; fecha: string }
    | null;
  acciones: ContractAction[];
  // Aún no los devuelve la API (E9 y E10): por ahora los agrega el simulador
  calificacion?: { puntaje: number; comentario: string | null; fecha: string } | null;
  reporte?: { descripcion: string; fecha: string } | null;
}

export type PaymentState = 'pendiente' | 'en_proceso' | 'pendiente_confirmacion' | 'pagado';

export interface PaymentRecord {
  contratacionId: string;
  servicio: string;
  contraparte: { nombre: string; fotoUrl: string | null };
  monto: number;
  estado: PaymentState;
  metodo: 'pse' | 'transferencia' | null;
  finalizada: string;
  fecha: string | null;
  intentosRechazados: number;
}
