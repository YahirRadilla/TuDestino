import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATION,
  NOTIFICATION_BADGE,
  NOTIFICATION_ICON,
  PUSH_RECEIVED_MESSAGE,
  applyBadge,
  buildNotificationOptions,
  handleNotificationClick,
  handlePush,
  handleSubscriptionChange,
  nextBadgeCount,
  parsePushPayload,
  pickClient,
  resolveClickUrl,
  urlBase64ToUint8Array,
} from './push.js';

const ORIGIN = 'https://tudestino.example';
const message = (value) => ({ json: () => value });

describe('parsePushPayload', () => {
  it('reads title, body, url, tag and badge', () => {
    expect(
      parsePushPayload(message({ title: 'Hola', body: 'Cuerpo', url: '/eventos/1', tag: 't', badge: 4 })),
    ).toEqual({ title: 'Hola', body: 'Cuerpo', url: '/eventos/1', tag: 't', badge: 4 });
  });

  it.each([
    ['no data', null],
    ['a push without payload', message(null)],
    [
      'invalid JSON',
      {
        json: () => {
          throw new SyntaxError('bad');
        },
      },
    ],
    ['a JSON array', message([1, 2])],
    ['a JSON string', message('hola')],
  ])('falls back to a generic notification for %s', (_label, data) => {
    expect(parsePushPayload(data)).toEqual({ ...DEFAULT_NOTIFICATION, badge: null });
  });

  it('keeps defaults for missing or wrong-typed fields', () => {
    const parsed = parsePushPayload(message({ title: 42, body: '   ', tag: {}, badge: 'x' }));
    expect(parsed).toMatchObject({
      title: 'TuDestino',
      body: DEFAULT_NOTIFICATION.body,
      tag: 'tudestino',
      badge: null,
    });
  });

  it.each([
    ['https://evil.example/x'],
    ['//evil.example/x'],
    ['javascript:alert(1)'],
    ['/\\evil.example'],
    ['relative'],
  ])('never accepts %s as a destination', (url) => {
    expect(parsePushPayload(message({ title: 'T', url })).url).toBe('/');
  });

  it('rejects negative or fractional badge counts and caps huge ones', () => {
    expect(parsePushPayload(message({ badge: -1 })).badge).toBeNull();
    expect(parsePushPayload(message({ badge: 1.5 })).badge).toBeNull();
    expect(parsePushPayload(message({ badge: 1e9 })).badge).toBe(9999);
  });

  it('clips very long texts', () => {
    const parsed = parsePushPayload(message({ title: 'a'.repeat(1000), body: 'b'.repeat(1000) }));
    expect(parsed.title).toHaveLength(120);
    expect(parsed.body).toHaveLength(240);
  });
});

describe('buildNotificationOptions', () => {
  it('shows the app icon, a monochrome badge, the tag and the target url in data', () => {
    expect(buildNotificationOptions({ body: 'b', tag: 'x', url: '/a' })).toMatchObject({
      body: 'b',
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      tag: 'x',
      renotify: true,
      data: { url: '/a' },
    });
  });
});

describe('resolveClickUrl', () => {
  it('keeps same-origin paths, queries and hashes', () => {
    expect(resolveClickUrl('/seguimiento?folio=TD-1#x', ORIGIN)).toBe('/seguimiento?folio=TD-1#x');
    expect(resolveClickUrl(`${ORIGIN}/eventos/2`, ORIGIN)).toBe('/eventos/2');
  });

  it.each([
    ['https://evil.example/phish'],
    ['//evil.example'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    [undefined],
    [null],
    [42],
  ])('falls back to "/" for %s', (url) => {
    expect(resolveClickUrl(url, ORIGIN)).toBe('/');
  });
});

describe('pickClient', () => {
  const win = (url, extra = {}) => ({ url, focused: false, visibilityState: 'hidden', ...extra });

  it('prefers the focused window, then a visible one, then any of ours', () => {
    const hidden = win(`${ORIGIN}/a`);
    const visible = win(`${ORIGIN}/b`, { visibilityState: 'visible' });
    const focused = win(`${ORIGIN}/c`, { focused: true });
    expect(pickClient([hidden, visible, focused], ORIGIN)).toBe(focused);
    expect(pickClient([hidden, visible], ORIGIN)).toBe(visible);
    expect(pickClient([hidden], ORIGIN)).toBe(hidden);
  });

  it('ignores other origins and returns null with no window', () => {
    expect(pickClient([win('https://other.example/')], ORIGIN)).toBeNull();
    expect(pickClient([], ORIGIN)).toBeNull();
    expect(pickClient(undefined, ORIGIN)).toBeNull();
  });
});

describe('nextBadgeCount', () => {
  it('uses the exact count from the server when present', () => {
    expect(nextBadgeCount(7, 2)).toBe(7);
    expect(nextBadgeCount(0, 5)).toBe(0);
  });
  it('adds one per push when the payload has no count', () => {
    expect(nextBadgeCount(null, 2)).toBe(3);
    expect(nextBadgeCount(null, undefined)).toBe(1);
    expect(nextBadgeCount(null, -4)).toBe(1);
    expect(nextBadgeCount(null, 9999)).toBe(9999);
  });
});

describe('applyBadge', () => {
  it('sets and clears the badge', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
    expect(await applyBadge(nav, 3)).toBe(true);
    expect(nav.setAppBadge).toHaveBeenCalledWith(3);
    expect(await applyBadge(nav, 0)).toBe(true);
    expect(nav.clearAppBadge).toHaveBeenCalled();
  });

  it('degrades quietly without the Badging API or when it throws', async () => {
    expect(await applyBadge({}, 3)).toBe(false);
    expect(await applyBadge(undefined, 0)).toBe(false);
    const failing = {
      setAppBadge: vi.fn(async () => {
        throw new Error('denied');
      }),
    };
    expect(await applyBadge(failing, 2)).toBe(false);
  });
});

describe('handlePush', () => {
  const setup = (overrides = {}) => {
    const client = { postMessage: vi.fn() };
    const deps = {
      data: message({ title: 'Reporte', body: 'En revisión', url: '/seguimiento', tag: 'r', badge: 2 }),
      registration: { showNotification: vi.fn(async () => {}) },
      clients: { matchAll: vi.fn(async () => [client]) },
      nav: { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) },
      badgeStore: { get: vi.fn(async () => 1), set: vi.fn(async () => {}) },
      ...overrides,
    };
    return { deps, client };
  };

  it('shows the notification, updates the badge and tells the open pages', async () => {
    const { deps, client } = setup();
    await handlePush(deps);
    expect(deps.registration.showNotification).toHaveBeenCalledWith(
      'Reporte',
      expect.objectContaining({ body: 'En revisión', tag: 'r', data: { url: '/seguimiento' } }),
    );
    expect(deps.badgeStore.set).toHaveBeenCalledWith(2);
    expect(deps.nav.setAppBadge).toHaveBeenCalledWith(2);
    expect(client.postMessage).toHaveBeenCalledWith({ type: PUSH_RECEIVED_MESSAGE, badge: 2, count: 2 });
  });

  it('counts up for anonymous pushes without a number', async () => {
    const { deps } = setup({ data: message({ title: 'Reporte' }) });
    await handlePush(deps);
    expect(deps.badgeStore.set).toHaveBeenCalledWith(2);
    expect(deps.nav.setAppBadge).toHaveBeenCalledWith(2);
  });

  it('still shows a notification for an empty or invalid payload', async () => {
    const { deps } = setup({ data: null });
    await handlePush(deps);
    expect(deps.registration.showNotification).toHaveBeenCalledWith('TuDestino', expect.any(Object));
  });

  it('shows the notification even when the badge storage and API fail', async () => {
    const { deps } = setup({
      badgeStore: {
        get: vi.fn(async () => {
          throw new Error('idb');
        }),
        set: vi.fn(),
      },
      clients: {
        matchAll: vi.fn(async () => {
          throw new Error('no clients');
        }),
      },
    });
    await expect(handlePush(deps)).resolves.toBeDefined();
    expect(deps.registration.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe('handleNotificationClick', () => {
  const notification = (url) => ({ data: { url } });

  it('focuses an open window of the app and navigates it', async () => {
    const existing = {
      url: `${ORIGIN}/explorar`,
      focused: true,
      visibilityState: 'visible',
      focus: vi.fn(async () => {}),
      navigate: vi.fn(async () => {}),
    };
    const clients = { matchAll: vi.fn(async () => [existing]), openWindow: vi.fn() };
    const result = await handleNotificationClick({
      notification: notification('/eventos/9'),
      clients,
      origin: ORIGIN,
    });
    expect(existing.focus).toHaveBeenCalled();
    expect(existing.navigate).toHaveBeenCalledWith('/eventos/9');
    expect(clients.openWindow).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'navigated', url: '/eventos/9' });
  });

  it('still navigates when the browser refuses to focus the window', async () => {
    const existing = {
      url: `${ORIGIN}/`,
      focus: vi.fn(async () => {
        throw new Error('Not allowed to focus');
      }),
      navigate: vi.fn(async () => {}),
    };
    const clients = { matchAll: vi.fn(async () => [existing]), openWindow: vi.fn() };
    const result = await handleNotificationClick({
      notification: notification('/perfil'),
      clients,
      origin: ORIGIN,
    });
    expect(existing.navigate).toHaveBeenCalledWith('/perfil');
    expect(clients.openWindow).not.toHaveBeenCalled();
    expect(result.action).toBe('navigated');
  });

  it('opens a new window when the app is closed', async () => {
    const clients = { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => {}) };
    const result = await handleNotificationClick({
      notification: notification('/seguimiento'),
      clients,
      origin: ORIGIN,
    });
    expect(clients.openWindow).toHaveBeenCalledWith('/seguimiento');
    expect(result.action).toBe('opened');
  });

  it('never navigates to another origin', async () => {
    const clients = { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => {}) };
    await handleNotificationClick({
      notification: notification('https://evil.example/'),
      clients,
      origin: ORIGIN,
    });
    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });

  it('opens a window when the existing one cannot navigate', async () => {
    const existing = {
      url: `${ORIGIN}/`,
      focus: vi.fn(),
      navigate: vi.fn(async () => {
        throw new Error('nope');
      }),
    };
    const clients = { matchAll: vi.fn(async () => [existing]), openWindow: vi.fn(async () => {}) };
    await handleNotificationClick({ notification: notification('/perfil'), clients, origin: ORIGIN });
    expect(clients.openWindow).toHaveBeenCalledWith('/perfil');
  });
});

describe('handleSubscriptionChange', () => {
  it('registers the browser-provided new subscription', async () => {
    const newSubscription = { endpoint: 'https://push.example/new' };
    const register = vi.fn(async () => {});
    await handleSubscriptionChange({
      event: { newSubscription },
      registration: {},
      fetchPublicKey: vi.fn(),
      register,
    });
    expect(register).toHaveBeenCalledWith(newSubscription);
  });

  it('re-subscribes with the old options when the browser gave no new subscription', async () => {
    const options = { userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2]) };
    const created = { endpoint: 'https://push.example/renewed' };
    const registration = { pushManager: { subscribe: vi.fn(async () => created) } };
    const register = vi.fn(async () => {});
    const fetchPublicKey = vi.fn();
    await handleSubscriptionChange({
      event: { oldSubscription: { options } },
      registration,
      fetchPublicKey,
      register,
    });
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(options);
    expect(fetchPublicKey).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith(created);
  });

  it('asks the server for the public key when there are no old options', async () => {
    const registration = { pushManager: { subscribe: vi.fn(async () => ({ endpoint: 'x' })) } };
    await handleSubscriptionChange({
      event: {},
      registration,
      fetchPublicKey: vi.fn(async () => 'AQID'),
      register: vi.fn(async () => {}),
    });
    const [options] = registration.pushManager.subscribe.mock.calls[0];
    expect(options.userVisibleOnly).toBe(true);
    expect([...options.applicationServerKey]).toEqual([1, 2, 3]);
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url with and without padding', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});
