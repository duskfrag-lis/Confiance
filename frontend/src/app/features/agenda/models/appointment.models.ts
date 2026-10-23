import { ContractStatus } from '../../contracting/models/contract';
import { BlockKey } from '../../profiles/models/profiles.models';

export type AppointmentState = 'proxima' | 'en_curso' | 'completada' | 'cancelada';

interface Person {
  nombre: string;
  fotoUrl: string | null;
}

export interface Appointment {
  id: string;
  contratacionId: string;
  servicio: string;
  fechaHora: string;
  bloque: BlockKey | null;
  estado: AppointmentState;
  estadoContratacion: ContractStatus;
  zona: { barrio: string; comuna: string };
  prestador?: Person & { id: string };
  cliente?: Person;
}

export const APPOINTMENT_STATE_LABEL: Record<AppointmentState, string> = {
  proxima: 'Próxima',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const BLOCK_LABEL: Record<BlockKey, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};
