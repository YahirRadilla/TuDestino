// Single source of truth for the app's top-level (main) screens. Top-level screens are reached from
// the primary navigation, so they never show a back arrow; everything else is a detail or
// secondary screen that does.
export const TOP_LEVEL_PATHS = [
  '/',
  '/explorar',
  '/mapa',
  '/eventos',
  '/educacion',
  '/favoritos',
  '/reportar',
  '/perfil',
];

function normalize(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return clean || '/';
}

export function isTopLevel(pathname) {
  return TOP_LEVEL_PATHS.includes(normalize(pathname));
}

// Where "back" lands when there is no in-app history to return to (deep link, reload).
export function parentRoute(pathname) {
  const path = normalize(pathname);
  if (path.startsWith('/destinos/')) return '/explorar';
  if (path.startsWith('/admin/')) return '/admin';
  if (path === '/admin') return '/perfil';
  if (path === '/seguimiento') return '/reportar';
  const parts = path.split('/').filter(Boolean);
  if (parts.length > 1) return `/${parts[0]}`;
  return '/';
}
