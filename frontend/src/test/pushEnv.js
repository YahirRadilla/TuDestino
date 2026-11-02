import { vi } from 'vitest';

export const FAKE_KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

export function fakeSubscription(endpoint = 'https://push.example.com/send/abc') {
  const subscription = {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: FAKE_KEYS }),
    unsubscribe: vi.fn(async () => true),
  };
  return subscription;
}

/**
 * Installs a fake Push-capable browser (Notification, PushManager, a ready service worker) and
 * returns the spies. `restore()` puts the globals back; call it in afterEach.
 *   permission:   initial Notification.permission
 *   answer:       what requestPermission() resolves to (and then becomes the permission)
 *   subscription: an existing subscription, or null
 */
export function installPushEnv({ permission = 'default', answer = 'granted', subscription = null } = {}) {
  const state = { permission, subscription };
  const created = fakeSubscription();
  const pushManager = {
    getSubscription: vi.fn(async () => state.subscription),
    subscribe: vi.fn(async () => {
      state.subscription = created;
      return created;
    }),
  };
  const registration = { pushManager };
  const requestPermission = vi.fn(async () => {
    state.permission = answer;
    return answer;
  });
  const NotificationMock = function Notification() {};
  Object.defineProperty(NotificationMock, 'permission', { get: () => state.permission });
  NotificationMock.requestPermission = requestPermission;

  const serviceWorker = {
    ready: Promise.resolve(registration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const previous = {
    Notification: window.Notification,
    PushManager: window.PushManager,
    serviceWorker: Object.getOwnPropertyDescriptor(navigator, 'serviceWorker'),
  };
  window.Notification = NotificationMock;
  window.PushManager = function PushManager() {};
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });

  return {
    state,
    pushManager,
    registration,
    requestPermission,
    created,
    serviceWorker,
    restore() {
      if (previous.Notification) window.Notification = previous.Notification;
      else delete window.Notification;
      if (previous.PushManager) window.PushManager = previous.PushManager;
      else delete window.PushManager;
      if (previous.serviceWorker) Object.defineProperty(navigator, 'serviceWorker', previous.serviceWorker);
      else delete navigator.serviceWorker;
    },
  };
}

/** Fakes the user agent / standalone mode for iOS checks. */
export function mockIos({ standalone = false } = {}) {
  const ua = vi
    .spyOn(navigator, 'userAgent', 'get')
    .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
  const previous = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return () => {
    ua.mockRestore();
    if (previous) window.matchMedia = previous;
    else delete window.matchMedia;
  };
}
