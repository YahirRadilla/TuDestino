// Web Push + Badging API (PWA-16). Pure decisions and small handlers with injected dependencies,
// free of Workbox and of `self`, so they can be unit tested. The worker (src/sw.js) only wires them
// to the `push`, `notificationclick` and `pushsubscriptionchange` events.

export const PUSH_RECEIVED_MESSAGE = 'PUSH_RECEIVED';
export const BADGE_META_KEY = 'badgeCount';
export const NOTIFICATION_ICON = '/icons/icon-192.png';
export const NOTIFICATION_BADGE = '/icons/badge-96.png';

export const DEFAULT_NOTIFICATION = Object.freeze({
  title: 'TuDestino',
  body: 'Tienes una novedad.',
  url: '/',
  tag: 'tudestino',
});

const MAX_TITLE = 120;
const MAX_BODY = 240;
const MAX_TAG = 64;
const MAX_BADGE = 9999;

const text = (value, max, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : fallback;
};

// A path inside the app. Absolute or protocol-relative URLs never survive.
const relativeUrl = (value) =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value.slice(0, 512) : DEFAULT_NOTIFICATION.url;

/**
 * Reads the payload of a `push` event (a PushMessageData or null). An empty, non-JSON or malformed
 * payload still produces a generic notification: a push that shows nothing makes the browser
 * display its own "this site updated in the background" notice.
 */
export function parsePushPayload(data) {
  let raw = null;
  try {
    raw = data?.json?.() ?? null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_NOTIFICATION, badge: null };
  const badge = Number.isInteger(raw.badge) && raw.badge >= 0 ? Math.min(raw.badge, MAX_BADGE) : null;
  return {
    title: text(raw.title, MAX_TITLE, DEFAULT_NOTIFICATION.title),
    body: text(raw.body, MAX_BODY, DEFAULT_NOTIFICATION.body),
    url: relativeUrl(raw.url),
    tag: text(raw.tag, MAX_TAG, DEFAULT_NOTIFICATION.tag),
    badge,
  };
}

export function buildNotificationOptions(payload) {
  return {
    body: payload.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: payload.tag,
    // Same tag = the previous notification is replaced; `renotify` makes it alert again.
    renotify: true,
    lang: 'es',
    data: { url: payload.url },
  };
}

/**
 * Where a click may take the person: same-origin only, expressed as path + query + hash. Anything
 * else (another site, `javascript:`, garbage) falls back to the home page.
 */
export function resolveClickUrl(url, origin) {
  if (typeof url !== 'string' || !url) return '/';
  try {
    const target = new URL(url, origin);
    if (target.origin !== origin) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

const sameOrigin = (client, origin) => {
  try {
    return new URL(client.url).origin === origin;
  } catch {
    return false;
  }
};

/** Prefers the window that is focused, then a visible one, then any other of the app. */
export function pickClient(windowClients, origin) {
  const ours = (windowClients ?? []).filter((client) => sameOrigin(client, origin));
  return (
    ours.find((client) => client.focused) ??
    ours.find((client) => client.visibilityState === 'visible') ??
    ours[0] ??
    null
  );
}

/**
 * Next badge number. The server sends the exact unread count for signed-in people; for anonymous
 * devices (report follow-ups) there is no inbox, so each push adds one until the app is opened.
 */
export const nextBadgeCount = (payloadBadge, previous) =>
  Number.isInteger(payloadBadge) && payloadBadge >= 0
    ? payloadBadge
    : Math.min((Number.isInteger(previous) && previous > 0 ? previous : 0) + 1, MAX_BADGE);

/** Badging API with graceful degradation: browsers without it (Firefox, Safari tabs) just skip. */
export async function applyBadge(nav, count) {
  try {
    if (count > 0 && typeof nav?.setAppBadge === 'function') await nav.setAppBadge(count);
    else if (count <= 0 && typeof nav?.clearAppBadge === 'function') await nav.clearAppBadge();
    else return false;
    return true;
  } catch {
    return false;
  }
}

/** Body of the worker's `push` listener. */
export async function handlePush({ data, registration, clients, nav, badgeStore }) {
  const payload = parsePushPayload(data);
  await registration.showNotification(payload.title, buildNotificationOptions(payload));
  let count = null;
  try {
    count = nextBadgeCount(payload.badge, await badgeStore.get());
    await badgeStore.set(count);
    await applyBadge(nav, count);
  } catch {
    // The badge is a nicety: it must never stop the notification from being shown.
  }
  try {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: PUSH_RECEIVED_MESSAGE, badge: payload.badge, count });
    }
  } catch {
    // Open pages refresh on their own when they regain focus.
  }
  return payload;
}

/** Body of the worker's `notificationclick` listener (the caller already closed the notification). */
export async function handleNotificationClick({ notification, clients, origin }) {
  const target = resolveClickUrl(notification?.data?.url, origin);
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = pickClient(windows, origin);
  if (existing) {
    // Focusing can be refused (the browser decides) without making navigation impossible.
    try {
      await existing.focus?.();
    } catch {
      // Keep going: navigating is still worth trying.
    }
    try {
      if (typeof existing.navigate === 'function') {
        await existing.navigate(target);
        return { action: 'navigated', url: target };
      }
    } catch {
      // Fall through and open a fresh window.
    }
  }
  await clients.openWindow(target);
  return { action: 'opened', url: target };
}

// ---- Subscription helpers shared by the page and the worker ----

/** base64url (the VAPID public key) to the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Body of the worker's `pushsubscriptionchange` listener: the browser rotated or expired the
 * subscription, so create a new one and tell the server. The worker has no session, so the device
 * registers anonymously; the page re-links it to the account the next time it opens.
 */
export async function handleSubscriptionChange({ event, registration, fetchPublicKey, register }) {
  let subscription = event.newSubscription ?? null;
  if (!subscription) {
    const options = event.oldSubscription?.options ?? {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await fetchPublicKey()),
    };
    subscription = await registration.pushManager.subscribe(options);
  }
  await register(subscription);
  return subscription;
}
