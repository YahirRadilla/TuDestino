import { describe, expect, it } from 'vitest';
import {
  CACHE_NAMES,
  IMAGE_CACHE_LIMITS,
  TILE_CACHE_LIMITS,
  isTileRequest,
  isCatalogRequest,
  isImageRequest,
  isNetworkOnlyRequest,
  isShareableResponse,
  isSkipWaitingMessage,
  staleCacheNames,
} from './swRouting.js';

const ORIGIN = 'https://tudestino.test';
const req = (path, { method = 'GET', headers = {}, origin = ORIGIN } = {}) => ({
  url: new URL(path, origin),
  request: { method, headers: new Headers(headers) },
  sameOrigin: origin === ORIGIN,
});
const EVENT_ID = '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10';

describe('isCatalogRequest (stale-while-revalidate)', () => {
  it.each([
    '/api/v1/destinations',
    '/api/v1/destinations?category=playa&limit=50',
    '/api/v1/destinations/balandra',
    '/api/v1/destination-categories',
    '/api/v1/events',
    `/api/v1/events/${EVENT_ID}`,
    '/api/v1/edu-contents?type=video',
    '/api/v1/edu-categories',
  ])('caches the public read %s', (path) => {
    expect(isCatalogRequest(req(path))).toBe(true);
  });

  it.each([
    '/api/v1/destinations/balandra/reviews',
    '/api/v1/auth/refresh',
    '/api/v1/me',
    '/api/v1/me/favorites',
    '/api/v1/reports',
    '/api/v1/health',
    '/api/v1/destinations/Not_A_Slug',
    '/api/v1/events/not-a-uuid',
    '/destinations',
  ])('does not cache %s', (path) => {
    expect(isCatalogRequest(req(path))).toBe(false);
  });

  it('never caches writes, personalised requests or other origins', () => {
    expect(isCatalogRequest(req('/api/v1/events', { method: 'POST' }))).toBe(false);
    expect(isCatalogRequest(req('/api/v1/events', { headers: { Authorization: 'Bearer x' } }))).toBe(false);
    expect(isCatalogRequest(req('/api/v1/events', { origin: 'https://evil.test' }))).toBe(false);
  });
});

describe('isNetworkOnlyRequest', () => {
  it.each([
    ['/api/v1/me', 'GET'],
    ['/api/v1/me/favorites', 'GET'],
    ['/api/v1/destinations/balandra/reviews', 'GET'],
    ['/api/v1/report-types', 'GET'],
  ])('%s %s goes straight to the network', (path, method) => {
    expect(isNetworkOnlyRequest(req(path, { method }))).toBe(true);
  });

  // Re-issuing a POST from the worker drops its multipart body on iOS Safari 26.x (image uploads).
  it.each([
    ['/api/v1/uploads/images', 'POST'],
    ['/api/v1/auth/login', 'POST'],
    ['/api/v1/auth/refresh', 'POST'],
    ['/api/v1/me/favorites/balandra', 'PUT'],
    ['/api/v1/destinations/balandra/reviews/me', 'PUT'],
    ['/api/v1/reports', 'POST'],
    ['/api/v1/reports/track', 'POST'],
    [`/api/v1/events/${EVENT_ID}/attendance`, 'DELETE'],
  ])('%s %s is not intercepted by the service worker', (path, method) => {
    expect(isNetworkOnlyRequest(req(path, { method }))).toBe(false);
  });

  it('sends authenticated reads of catalog paths to the network too', () => {
    const personalised = req('/api/v1/events', { headers: { Authorization: 'Bearer x' } });
    expect(isNetworkOnlyRequest(personalised)).toBe(true);
  });

  it('leaves public catalog reads and non-API requests alone', () => {
    expect(isNetworkOnlyRequest(req('/api/v1/destinations'))).toBe(false);
    expect(isNetworkOnlyRequest(req('/explorar'))).toBe(false);
    expect(isNetworkOnlyRequest(req('/api/v1/auth/login', { origin: 'https://other.test' }))).toBe(false);
  });

  it('catalog and network-only decisions never overlap', () => {
    for (const path of ['/api/v1/destinations', '/api/v1/events', '/api/v1/me', '/api/v1/auth/x']) {
      const r = req(path);
      expect(isCatalogRequest(r) && isNetworkOnlyRequest(r)).toBe(false);
    }
  });
});

describe('isImageRequest (cache first)', () => {
  it('matches own /img files and Cloudinary', () => {
    expect(isImageRequest(req('/img/balandra-1.svg'))).toBe(true);
    expect(
      isImageRequest(
        req('https://res.cloudinary.com/demo/image/upload/f_auto/x.jpg', {
          origin: 'https://res.cloudinary.com',
        }),
      ),
    ).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isImageRequest(req('/assets/app.js'))).toBe(false);
    expect(isImageRequest(req('/img/x.svg', { origin: 'https://evil.test' }))).toBe(false);
    expect(isImageRequest(req('/img/x.svg', { method: 'POST' }))).toBe(false);
  });

  it('limits the image cache to about 150 entries for 30 days', () => {
    expect(IMAGE_CACHE_LIMITS).toEqual({ maxEntries: 150, maxAgeSeconds: 2_592_000 });
  });
});

describe('isShareableResponse', () => {
  const response = (status, headers = {}) => ({ status, headers: new Headers(headers) });

  it('accepts a plain public 200', () => {
    expect(isShareableResponse(response(200, { 'Cache-Control': 'public, max-age=60' }))).toBe(true);
    expect(isShareableResponse(response(200, { Vary: 'Authorization, Origin' }))).toBe(true);
  });

  it.each([
    ['no-store', { 'Cache-Control': 'no-store' }],
    ['private', { 'Cache-Control': 'private, no-store' }],
    ['PRIVATE uppercase', { 'Cache-Control': 'Private' }],
    ['Vary *', { Vary: '*' }],
  ])('rejects %s', (_label, headers) => {
    expect(isShareableResponse(response(200, headers))).toBe(false);
  });

  it('rejects errors, redirects and missing responses', () => {
    expect(isShareableResponse(response(500))).toBe(false);
    expect(isShareableResponse(response(404))).toBe(false);
    expect(isShareableResponse(null)).toBe(false);
  });

  it('only accepts opaque responses when the route allows them (cross-origin images)', () => {
    expect(isShareableResponse(response(0))).toBe(false);
    expect(isShareableResponse(response(0), { allowOpaque: true })).toBe(true);
  });
});

describe('staleCacheNames', () => {
  it('lists only our own old caches', () => {
    const names = [
      CACHE_NAMES.api,
      CACHE_NAMES.images,
      'td-api-v0',
      'td-images-v0',
      'workbox-precache-v2-x',
      'other',
    ];
    expect(staleCacheNames(names)).toEqual(['td-api-v0', 'td-images-v0']);
  });
});

describe('isSkipWaitingMessage', () => {
  it('recognises the update handshake only', () => {
    expect(isSkipWaitingMessage({ type: 'SKIP_WAITING' })).toBe(true);
    expect(isSkipWaitingMessage({ type: 'OTHER' })).toBe(false);
    expect(isSkipWaitingMessage(undefined)).toBe(false);
  });
});

describe('public map pins (stale-while-revalidate)', () => {
  it('caches the public layer, with or without a bbox', () => {
    expect(isCatalogRequest(req('/api/v1/map/pins'))).toBe(true);
    expect(isCatalogRequest(req('/api/v1/map/pins?bbox=-111,23,-109,25&limit=100'))).toBe(true);
    expect(isNetworkOnlyRequest(req('/api/v1/map/pins'))).toBe(false);
  });

  it('NEVER caches the staff layer or authenticated requests', () => {
    for (const path of ['/api/v1/admin/map/pins', '/api/v1/admin/map/pins?status=pending']) {
      expect(isCatalogRequest(req(path))).toBe(false);
      expect(isNetworkOnlyRequest(req(path))).toBe(true);
    }
    const withToken = req('/api/v1/map/pins', { headers: { Authorization: 'Bearer x' } });
    expect(isCatalogRequest(withToken)).toBe(false);
    expect(isNetworkOnlyRequest(withToken)).toBe(true);
    expect(isCatalogRequest(req('/api/v1/map/pins', { method: 'POST' }))).toBe(false);
    expect(isCatalogRequest(req('/api/v1/map/pins/extra'))).toBe(false);
  });
});

describe('isTileRequest (OpenStreetMap tiles, cache first)', () => {
  const tile = (path, options = {}) => req(path, { origin: 'https://tile.openstreetmap.org', ...options });

  it.each([
    'https://tile.openstreetmap.org/12/731/1722.png',
    'https://a.tile.openstreetmap.org/5/6/13.png',
    'https://c.tile.openstreetmap.org/19/100000/200000.png',
  ])('matches %s', (href) => {
    const url = new URL(href);
    expect(isTileRequest({ url, request: { method: 'GET', headers: new Headers() } })).toBe(true);
  });

  it.each([
    ['other host', 'https://tiles.evil.test/12/1/2.png'],
    ['look-alike host', 'https://tile.openstreetmap.org.evil.test/12/1/2.png'],
    ['not a tile path', 'https://tile.openstreetmap.org/12/1/2.json'],
    ['plain http', 'http://tile.openstreetmap.org/12/1/2.png'],
    ['site root', 'https://tile.openstreetmap.org/'],
  ])('ignores %s', (_label, href) => {
    expect(isTileRequest({ url: new URL(href), request: { method: 'GET', headers: new Headers() } })).toBe(
      false,
    );
  });

  it('only serves GETs without credentials', () => {
    expect(isTileRequest(tile('/12/1/2.png', { method: 'POST' }))).toBe(false);
    expect(isTileRequest(tile('/12/1/2.png', { headers: { Authorization: 'Bearer x' } }))).toBe(false);
  });

  it('bounds the tile cache to ~300 tiles for 7 days', () => {
    expect(TILE_CACHE_LIMITS).toEqual({ maxEntries: 300, maxAgeSeconds: 604_800 });
  });

  it('keeps the tile cache when cleaning old caches', () => {
    expect(CACHE_NAMES.tiles).toBe('td-tiles-v1');
    expect(staleCacheNames([CACHE_NAMES.tiles, 'td-tiles-v0'])).toEqual(['td-tiles-v0']);
  });

  it('never routes a tile through the API rules', () => {
    const r = tile('/12/1/2.png');
    expect(isCatalogRequest(r) || isNetworkOnlyRequest(r) || isImageRequest(r)).toBe(false);
  });
});
