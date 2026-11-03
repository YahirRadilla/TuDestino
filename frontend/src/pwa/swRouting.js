// Pure decisions of the service worker (src/sw.js), kept free of Workbox and of `self` so they can
// be unit tested. The worker only wires these functions to Workbox strategies.

export const CACHE_NAMES = Object.freeze({
  api: 'td-api-v1',
  images: 'td-images-v1',
  tiles: 'td-tiles-v1',
});

export const IMAGE_CACHE_LIMITS = Object.freeze({
  maxEntries: 150,
  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
});

// OpenStreetMap tiles already visited: bounded on purpose (tile usage policy: no bulk download).
export const TILE_CACHE_LIMITS = Object.freeze({
  maxEntries: 300,
  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
});

export const API_CACHE_LIMITS = Object.freeze({
  maxEntries: 120,
  maxAgeSeconds: 7 * 24 * 60 * 60,
});

const API_PREFIX = '/api/v1';

// GET resources that are public, shared by everyone and safe to serve stale while revalidating:
// destinations (+ one), categories, events (+ one by uuid), educational content and the public
// map layer (/map/pins: rounded, resolved, non-sensitive reports; /admin/map/pins is NOT here).
// Reviews (/destinations/:slug/reviews) are deliberately NOT here: a person who just published a
// review must never be shown the list without it.
const SWR_PATH =
  /^\/api\/v1\/(?:destinations(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?|destination-categories|events(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|edu-contents|edu-categories|map\/pins)\/?$/;

// Never cached by the worker, whatever the method: identity, the account and anything else
// under /api (reports, push, admin...). They always go to the network.
const NETWORK_ONLY_PATH = /^\/api\/v1\/(?:auth|me)(?:\/|$)/;

export const isApiPath = (pathname) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

const hasAuthorization = (request) => Boolean(request?.headers?.has?.('Authorization'));

// Stale-while-revalidate candidates. A request that carries credentials is personalised and
// bypasses the shared cache entirely (the app then falls back to its own IndexedDB mirror).
export function isCatalogRequest({ url, request, sameOrigin = true }) {
  return sameOrigin && request.method === 'GET' && SWR_PATH.test(url.pathname) && !hasAuthorization(request);
}

export function isNetworkOnlyRequest({ url, request, sameOrigin = true }) {
  if (!sameOrigin || !isApiPath(url.pathname)) return false;
  // Non-GET requests must bypass the worker completely. Re-issuing an intercepted
  // multipart/form-data POST from the service worker loses its body on Safari 26.x (iOS),
  // which made image uploads arrive as empty multipart bodies.
  if (request.method !== 'GET') return false;
  // Authenticated GETs, the identity/account endpoints and every other API route that is not
  // an explicit catalog read also go straight to the network.
  return (
    NETWORK_ONLY_PATH.test(url.pathname) ||
    hasAuthorization(request) ||
    !SWR_PATH.test(url.pathname)
  );
}

// Raster tiles of the OpenStreetMap standard layer: https://{a|b|c}.tile.openstreetmap.org/z/x/y.png
const TILE_HOST = /^(?:[abc]\.)?tile\.openstreetmap\.org$/;
const TILE_PATH = /^\/\d{1,2}\/\d{1,7}\/\d{1,7}\.png$/;

export function isTileRequest({ url, request }) {
  return (
    request.method === 'GET' &&
    url.protocol === 'https:' &&
    TILE_HOST.test(url.hostname) &&
    TILE_PATH.test(url.pathname) &&
    !hasAuthorization(request)
  );
}

const IMAGE_HOSTS = new Set(['res.cloudinary.com']);

export function isImageRequest({ url, request, sameOrigin = true }) {
  if (request.method !== 'GET') return false;
  if (IMAGE_HOSTS.has(url.hostname)) return true;
  return sameOrigin && url.pathname.startsWith('/img/');
}

/**
 * May this response be written to a cache shared by every visitor? No when the server marked it
 * private/no-store, when it varies on everything, or when it is not a plain success.
 * Opaque cross-origin images (status 0) are allowed: they carry no readable headers.
 */
export function isShareableResponse(response, { allowOpaque = false } = {}) {
  if (!response) return false;
  if (response.status === 0) return allowOpaque;
  if (response.status !== 200) return false;
  const cacheControl = (response.headers?.get?.('Cache-Control') ?? '').toLowerCase();
  if (/(?:^|[\s,])(?:no-store|private)(?:[\s,=]|$)/.test(cacheControl)) return false;
  const vary = (response.headers?.get?.('Vary') ?? '').trim();
  return vary !== '*';
}

/**
 * Caches created by an older version of this worker. Workbox's own precache caches are cleaned by
 * `cleanupOutdatedCaches()`; this covers the `td-*` caches we name ourselves.
 */
export function staleCacheNames(existingNames, current = Object.values(CACHE_NAMES)) {
  return existingNames.filter((name) => name.startsWith('td-') && !current.includes(name));
}

// The page asks a waiting worker to take over after the user accepts the update toast.
export const isSkipWaitingMessage = (data) => data?.type === 'SKIP_WAITING';
