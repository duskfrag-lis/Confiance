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
      { label: 'Necesidades', icon: 'clipboard', path: '/prestador/necesidades' },
      { label: 'Servicios', icon: 'wrench', path: '/prestador/servicios' },
      { label: 'Contrataciones', icon: 'briefcase', path: '/prestador/contrataciones' },
      { label: 'Agenda', icon: 'calendar-check', path: '/prestador/agenda' },
      { label: 'Mensajes', icon: 'chat', path: '/prestador/mensajes', badge: 'messages' },
      { label: 'Pagos', icon: 'money', path: '/prestador/pagos' },
      { label: 'Reclamos', icon: 'file-text', path: '/prestador/reclamos' },
    ],
  },
  {
    items: [
      { label: 'Perfil profesional', icon: 'user', path: '/prestador/perfil' },
      { label: 'Trabajos realizados', icon: 'image', path: '/prestador/trabajos' },
      { label: 'Verificación', icon: 'shield-check', path: '/prestador/verificacion' },
      { label: 'Cuenta bancaria', icon: 'credit-card', path: '/prestador/informacion-bancaria' },
    ],
  },
];

export const CLIENT_NAV: NavSection[] = [
  {
    items: [
      { label: 'Inicio', icon: 'home', path: '/cliente', exact: true },
      { label: 'Buscar servicios', icon: 'search', path: '/cliente/buscar' },
      { label: 'Necesidades', icon: 'clipboard', path: '/cliente/necesidades' },
      { label: 'Contrataciones', icon: 'briefcase', path: '/cliente/contrataciones' },
      { label: 'Agenda', icon: 'calendar-check', path: '/cliente/agenda' },
      { label: 'Mensajes', icon: 'chat', path: '/cliente/mensajes', badge: 'messages' },
      { label: 'Pagos', icon: 'money', path: '/cliente/pagos' },
      { label: 'Reclamos', icon: 'file-text', path: '/cliente/reclamos' },
    ],
  },
  {
    items: [{ label: 'Perfil', icon: 'user', path: '/cliente/perfil' }],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { label: 'Resumen', icon: 'squares', path: '/admin', exact: true },
      { label: 'Reclamos', icon: 'file-text', path: '/admin/reclamos' },
      { label: 'Verificaciones', icon: 'shield-check', path: '/admin/verificaciones' },
      { label: 'Fuerza mayor', icon: 'triangle-alert', path: '/admin/fuerza-mayor' },
    ],
  },
];
