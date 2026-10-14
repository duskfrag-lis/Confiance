import { IconName } from '../../shared/components/icon/icon';

export interface NavItem {
  label: string;
  icon: IconName;
  path: string;
  badge?: 'messages';
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const PROVIDER_NAV: NavSection[] = [
  {
    items: [
      { label: 'Inicio', icon: 'home', path: '/prestador', exact: true },
      { label: 'Mis contrataciones', icon: 'briefcase', path: '/prestador/contrataciones' },
      { label: 'Mis servicios', icon: 'wrench', path: '/prestador/servicios' },
      { label: 'Necesidades', icon: 'clipboard', path: '/prestador/necesidades' },
      { label: 'Agenda', icon: 'calendar-check', path: '/prestador/agenda' },
      { label: 'Mensajes', icon: 'chat', path: '/prestador/mensajes', badge: 'messages' },
    ],
  },
  {
    title: 'Mi perfil de prestador',
    items: [
      { label: 'Perfil profesional', icon: 'user', path: '/prestador/perfil' },
      { label: 'Trabajos realizados', icon: 'image', path: '/prestador/trabajos' },
      { label: 'Verificación', icon: 'shield-check', path: '/prestador/verificacion' },
      { label: 'Información bancaria', icon: 'credit-card', path: '/prestador/informacion-bancaria' },
    ],
  },
];
