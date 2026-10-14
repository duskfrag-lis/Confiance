import { IconName } from '../../../shared/components/icon/icon';

export interface DashboardStat {
  icon: IconName;
  value: string;
  label: string;
}

export interface AttentionItem {
  id: string;
  icon: IconName;
  title: string;
  detail: string;
  link: string;
}

export interface ProfileCheck {
  label: string;
  done: boolean;
}

export type AppointmentStatus = 'confirmado' | 'en_curso';

export interface UpcomingAppointment {
  id: string;
  service: string;
  clientName: string;
  clientPhotoUrl: string | null;
  date: Date;
  status: AppointmentStatus;
  price: number;
}

export interface NearbyNeed {
  id: string;
  title: string;
  clientName: string;
  clientPhotoUrl: string | null;
  neighborhood: string;
  budgetMin: number;
  budgetMax: number;
  matchesProfile: boolean;
}

export interface ProviderDashboard {
  stats: DashboardStat[];
  attention: AttentionItem[];
  profileChecks: ProfileCheck[];
  appointments: UpcomingAppointment[];
  needs: NearbyNeed[];
}
