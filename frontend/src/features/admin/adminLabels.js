import { STATUS_LABELS } from '../reports/reportTypes.js';

export const REPORT_STATUS_LABELS = STATUS_LABELS;

export const EVENT_STATUS_LABELS = Object.freeze({
  pending: 'Pendiente de revisión',
  published: 'Publicado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
});

export const ROLE_LABELS = Object.freeze({
  user: 'Usuario',
  authority: 'Autoridad',
  admin: 'Administrador',
});

export const DESTINATION_STATUS_LABELS = Object.freeze({
  draft: 'Borrador',
  published: 'Publicado',
});

export const EDU_TYPE_LABELS = Object.freeze({
  article: 'Artículo',
  video: 'Video',
  link: 'Enlace',
});

// Navigation of the panel. `roles` decides who sees the entry (the server enforces it as well).
export const ADMIN_NAV = Object.freeze([
  { to: '/admin', label: 'Resumen', icon: 'compass', end: true, roles: ['authority', 'admin'] },
  { to: '/admin/reportes', label: 'Reportes', icon: 'flag', roles: ['authority', 'admin'] },
  { to: '/admin/mapa', label: 'Mapa', icon: 'map', roles: ['authority', 'admin'] },
  { to: '/admin/destinos', label: 'Destinos', icon: 'pin', roles: ['authority', 'admin'] },
  { to: '/admin/eventos', label: 'Eventos', icon: 'calendar', roles: ['authority', 'admin'] },
  { to: '/admin/educacion', label: 'Educación', icon: 'book', roles: ['authority', 'admin'] },
  { to: '/admin/usuarios', label: 'Usuarios', icon: 'users', roles: ['admin'] },
]);
