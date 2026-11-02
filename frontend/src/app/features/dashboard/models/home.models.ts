import { IconName } from '../../../shared/components/icon/icon';

export type PendingTone = 'accent' | 'primary' | 'success' | 'warning';

export interface PendingItem {
  id: string;
  icon: IconName;
  tone: PendingTone;
  title: string;
  detail: string;
  cta: string;
  link: string[];
  at: Date;
}

export interface NextAppointment {
  contractId: string;
  service: string;
  date: Date;
  inProgress: boolean;
  counterpart: { name: string; photoUrl: string | null };
  place: string;
  link: string[];
}
