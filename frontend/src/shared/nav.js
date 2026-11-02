// Primary navigation shared by the floating bottom bar (mobile) and the top header (desktop).
// `mobile`: 'tab' = bottom bar tab, 'fab' = floating action button, false = desktop header only
// (still reachable on mobile through the profile).
export const NAV_ITEMS = [
  {
    to: '/explorar',
    label: 'Explorar',
    icon: 'compass',
    mobile: 'tab',
    isActive: (p) => p === '/' || p.startsWith('/explorar') || p.startsWith('/destinos'),
  },
  { to: '/mapa', label: 'Mapa', icon: 'map', mobile: 'tab', isActive: (p) => p.startsWith('/mapa') },
  {
    to: '/eventos',
    label: 'Eventos',
    icon: 'calendar',
    mobile: 'tab',
    isActive: (p) => p.startsWith('/eventos'),
  },
  {
    to: '/educacion',
    label: 'Aprender',
    icon: 'book',
    mobile: 'tab',
    isActive: (p) => p.startsWith('/educacion'),
  },
  {
    to: '/favoritos',
    label: 'Favoritos',
    icon: 'heart',
    mobile: false,
    isActive: (p) => p.startsWith('/favoritos'),
  },
  {
    to: '/reportar',
    label: 'Reportar',
    icon: 'flag',
    mobile: 'fab',
    isActive: (p) => p.startsWith('/reportar') || p.startsWith('/seguimiento'),
  },
  {
    to: '/perfil',
    label: 'Perfil',
    icon: 'user',
    mobile: 'tab',
    isActive: (p) =>
      p.startsWith('/perfil') ||
      p.startsWith('/login') ||
      p.startsWith('/registro') ||
      p.startsWith('/recuperar') ||
      p.startsWith('/restablecer') ||
      p.startsWith('/notificaciones'),
  },
];

export const MOBILE_TABS = NAV_ITEMS.filter((item) => item.mobile === 'tab');
export const REPORT_ITEM = NAV_ITEMS.find((item) => item.mobile === 'fab');
