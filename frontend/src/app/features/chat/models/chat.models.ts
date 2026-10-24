import { ContractStatus } from '../../contracting/models/contract';

export const MAX_MESSAGE_LENGTH = 2000;

export interface ConversationApi {
  contratacionId: string;
  servicio: string;
  estado: ContractStatus;
  fechaHora: string;
  contraparte: { nombre: string; fotoUrl: string | null };
  ultimoMensaje: { texto: string; fecha: string; mio: boolean } | null;
  sinLeer: number;
  soloLectura: boolean;
}

export interface MessageApi {
  id: string;
  texto: string;
  fecha: string;
  mio: boolean;
}

export interface ThreadApi {
  soloLectura: boolean;
  mensajes: MessageApi[];
  leidoPorContraparte: string | null;
  escribiendo?: boolean;
}

export const isReadOnly = (status: ContractStatus): boolean =>
  status === 'rechazado' || status === 'cancelado' || status === 'completado';
