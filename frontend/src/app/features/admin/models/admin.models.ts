import { ClaimReason, ClaimState, ClaimStep } from '../../claims/models/claim.models';
import { ContractStatus } from '../../contracting/models/contract';
import { DocumentType } from '../../verification/models/verification.models';

type Party = { nombre: string; rol: 'cliente' | 'prestador' };

export interface AdminClaim {
  id: string;
  contratacionId: string;
  servicio: string;
  motivo: ClaimReason;
  estado: ClaimState;
  creado: string;
  actualizado: string;
  presentadoPor: Party;
  contra: Party;
}

export interface AdminClaimDetail extends AdminClaim {
  descripcion: string;
  fotos: string[];
  historial: (ClaimStep & { admin: string | null })[];
  contratacion: { id: string; servicio: string; estado: ContractStatus; fechaHora: string; valor: number; zona: string };
}

export interface AdminVerification {
  id: string;
  prestador: { nombre: string; fotoUrl: string | null };
  tipoDocumento: DocumentType;
  numero: string;
  fotos: string[];
  informacion: string | null;
  enviada: string;
  coincideConRegistro: boolean;
  anteriores: number;
}

export type VerificationDecision = 'aprobada' | 'rechazada' | 'correccion';

export interface AdminForceMajeure {
  contratacionId: string;
  servicio: string;
  canceladoPor: Party;
  contraparte: Party;
  motivo: string;
  evidencia: { nombre: string; url: string | null } | null;
  cancelada: string;
  fechaServicio: string;
  estadoAlCancelar: ContractStatus;
}

export interface AdminSummary {
  reclamos: number;
  verificaciones: number;
  fuerzaMayor: number;
}
