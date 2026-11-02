import { IconName } from '../../../shared/components/icon/icon';

export type NotificationType =
  | 'solicitud'
  | 'contratacion'
  | 'servicio'
  | 'cancelacion'
  | 'reagendamiento'
  | 'recordatorio'
  | 'mensaje'
  | 'pago'
  | 'interes'
  | 'necesidad'
  | 'verificacion'
  | 'reclamo';

export interface NotificationApi {
  id: string;
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  contratacionId: string | null;
  necesidadId?: string | null;
  reclamoId?: string | null;
}

export type NotificationCategory = 'contracts' | 'messages' | 'payments' | 'needs' | 'account';

export type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'error';

export const NOTIFICATION_KIND: Record<NotificationType, { icon: IconName; tone: Tone; category: NotificationCategory }> = {
  solicitud: { icon: 'clipboard', tone: 'primary', category: 'contracts' },
  contratacion: { icon: 'circle-check', tone: 'primary', category: 'contracts' },
  servicio: { icon: 'briefcase', tone: 'primary', category: 'contracts' },
  cancelacion: { icon: 'x-circle', tone: 'error', category: 'contracts' },
  reagendamiento: { icon: 'calendar', tone: 'warning', category: 'contracts' },
  recordatorio: { icon: 'clock', tone: 'warning', category: 'contracts' },
  mensaje: { icon: 'chat', tone: 'accent', category: 'messages' },
  pago: { icon: 'money', tone: 'success', category: 'payments' },
  interes: { icon: 'sparkle', tone: 'accent', category: 'needs' },
  necesidad: { icon: 'clipboard', tone: 'accent', category: 'needs' },
  verificacion: { icon: 'shield-check', tone: 'success', category: 'account' },
  reclamo: { icon: 'flag', tone: 'warning', category: 'account' },
};

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  contracts: 'Contrataciones',
  messages: 'Mensajes',
  payments: 'Pagos',
  needs: 'Necesidades',
  account: 'Cuenta',
};
