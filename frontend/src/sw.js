/* TuDestino Service Worker (hand-written, Workbox as a library; see ADR-02). */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import {
  API_CACHE_LIMITS,
  CACHE_NAMES,
  IMAGE_CACHE_LIMITS,
  TILE_CACHE_LIMITS,
  isCatalogRequest,
  isImageRequest,
  isNetworkOnlyRequest,
  isShareableResponse,
  isSkipWaitingMessage,
  isTileRequest,
  staleCacheNames,
} from './pwa/swRouting.js';
import { OUTBOX_CHANGED_MESSAGE, handleReportsSync, isReportsSyncEvent } from './pwa/reportSync.js';
import { flushOutbox } from './features/reports/reportQueue.js';
import { handleNotificationClick, handlePush, handleSubscriptionChange } from './pwa/push.js';
import { badgeStore } from './pwa/badgeStore.js';
import { fetchPublicKey, saveSubscription } from './features/notifications/pushApi.js';

// App shell: precache versioned by hash (injected at build time).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation: SPA fallback to index.html (never for API or file requests).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
  }),
);

const sameOrigin = (url) => url.origin === self.location.origin;
const match = (predicate) => (context) =>
  predicate({ url: context.url, request: context.request, sameOrigin: sameOrigin(context.url) });

// Keeps responses meant for one person (or marked no-store/private) out of the shared cache.
const sharedCacheOnly = (options) => ({
  cacheWillUpdate: async ({ response }) => (isShareableResponse(response, options) ? response : null),
});

// Public catalog reads: answer from cache at once, refresh in the background.
registerRoute(
  match(isCatalogRequest),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.api,
    plugins: [
      sharedCacheOnly(),
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ ...API_CACHE_LIMITS, purgeOnQuotaError: true }),
    ],
  }),
);

// Images (own /img and Cloudinary): cache first, bounded by count and age.
registerRoute(
  match(isImageRequest),
  new CacheFirst({
    cacheName: CACHE_NAMES.images,
    plugins: [
      sharedCacheOnly({ allowOpaque: true }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ ...IMAGE_CACHE_LIMITS, purgeOnQuotaError: true }),
    ],
  }),
);

// OpenStreetMap tiles (map, PWA-08): only the tiles the person already looked at stay available
// offline. Cache first, small and short-lived on purpose (OSM tile usage policy); error responses
// are never stored, so a throttled tile does not stick around.
registerRoute(
  match(isTileRequest),
  new CacheFirst({
    cacheName: CACHE_NAMES.tiles,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ ...TILE_CACHE_LIMITS, purgeOnQuotaError: true }),
    ],
  }),
);

// Identity, the account and non-catalog API reads: always the network for GET. Writes are NOT
// registered on purpose: Workbox would re-issue the request via fetch() and iOS Safari 26.x then
// sends multipart POSTs with an empty body. Leaving them unrouted lets the browser send them.
const networkOnly = new NetworkOnly();
registerRoute(match(isNetworkOnlyRequest), networkOnly, 'GET');

// If nothing could answer a page request, serve the precached offline page.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const offline = await matchPrecache('/offline.html');
    if (offline) return offline;
  }
  return Response.error();
});

// Background Sync (PWA-13): the page queues reports in IndexedDB and registers the `reports-outbox`
// tag; the browser wakes this worker when the connection returns, even with the app closed.
// The delivery loop is the same code the page uses (reportQueue.js), with the same atomic claim.
async function notifyReportClients(summary) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: OUTBOX_CHANGED_MESSAGE, summary });
}

self.addEventListener('sync', (event) => {
  if (!isReportsSyncEvent(event)) return;
  event.waitUntil(handleReportsSync({ flush: flushOutbox, notify: notifyReportClients }));
});

// Web Push + Badging (PWA-16). The server sends a tiny JSON payload (title, body, relative url,
// tag, optional unread count); the decisions live in pwa/push.js. A push always shows a
// notification: browsers penalise (or replace) a "silent" push.
self.addEventListener('push', (event) => {
  event.waitUntil(
    handlePush({
      data: event.data,
      registration: self.registration,
      clients: self.clients,
      nav: self.navigator,
      badgeStore,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    handleNotificationClick({
      notification: event.notification,
      clients: self.clients,
      origin: self.location.origin,
    }),
  );
});

// The browser rotated or expired the subscription: renew it so pushes keep arriving.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    handleSubscriptionChange({
      event,
      registration: self.registration,
      fetchPublicKey,
      register: (subscription) => saveSubscription(subscription, { auth: false }),
    }),
  );
});

// A new worker removes the `td-*` caches that older versions created and no longer use.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(staleCacheNames(names).map((name) => caches.delete(name)))),
  );
});

// The page asks to activate a waiting worker after the user accepts the update toast.
self.addEventListener('message', (event) => {
  if (isSkipWaitingMessage(event.data)) self.skipWaiting();
});
clientsClaim();
