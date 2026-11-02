import { describe, it, expect } from 'vitest';
import { TOP_LEVEL_PATHS, isTopLevel, parentRoute } from './routes.js';
import { NAV_ITEMS } from './nav.js';

describe('routes', () => {
  it.each(TOP_LEVEL_PATHS)('%s is top-level', (path) => {
    expect(isTopLevel(path)).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isTopLevel('/favoritos/')).toBe(true);
  });

  it.each([
    '/destinos/balandra',
    '/eventos/12',
    '/eventos/proponer',
    '/seguimiento',
    '/perfil/eventos',
    '/notificaciones',
    '/login',
    '/admin',
  ])('%s is a secondary screen', (path) => {
    expect(isTopLevel(path)).toBe(false);
  });

  it('every primary nav destination is top-level', () => {
    for (const item of NAV_ITEMS) expect(isTopLevel(item.to)).toBe(true);
  });

  it.each([
    ['/destinos/balandra', '/explorar'],
    ['/eventos/12', '/eventos'],
    ['/eventos/proponer', '/eventos'],
    ['/perfil/resenas', '/perfil'],
    ['/reportar/pendientes', '/reportar'],
    ['/seguimiento', '/reportar'],
    ['/admin', '/perfil'],
    ['/admin/reportes/3', '/admin'],
    ['/notificaciones', '/'],
  ])('parent of %s is %s', (path, parent) => {
    expect(parentRoute(path)).toBe(parent);
  });
});
