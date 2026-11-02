import { describe, expect, it } from 'vitest';
import { currentPermission, getPushSupport, isIos, isStandalone } from './pushSupport.js';

const win = ({ standalone = false, push = true, notification = true, permission = 'default' } = {}) => ({
  matchMedia: (query) => ({ matches: standalone && query.includes('standalone') }),
  ...(push ? { PushManager: function PushManager() {} } : {}),
  ...(notification ? { Notification: { permission } } : {}),
});
const nav = (extra = {}) => ({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130',
  platform: 'Linux',
  maxTouchPoints: 0,
  serviceWorker: {},
  ...extra,
});
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

describe('isIos', () => {
  it('recognises iPhone, iPad and iPadOS pretending to be a Mac', () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0)' })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
      true,
    );
  });
  it('does not mistake desktops and Android', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
      false,
    );
    expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(false);
    expect(isIos()).toBe(false);
  });
});

describe('isStandalone', () => {
  it('detects display-mode: standalone and the legacy iOS flag', () => {
    expect(isStandalone(win({ standalone: true }), nav())).toBe(true);
    expect(isStandalone(win(), nav({ standalone: true }))).toBe(true);
    expect(isStandalone(win(), nav())).toBe(false);
  });
});

describe('getPushSupport', () => {
  it('is ready in a capable browser', () => {
    expect(getPushSupport(win(), nav())).toMatchObject({ kind: 'ready', ios: false });
  });
  it('is unsupported without PushManager, Notification or a service worker', () => {
    expect(getPushSupport(win({ push: false }), nav()).kind).toBe('unsupported');
    expect(getPushSupport(win({ notification: false }), nav()).kind).toBe('unsupported');
    const { serviceWorker: _omit, ...withoutWorker } = nav();
    expect(getPushSupport(win(), withoutWorker).kind).toBe('unsupported');
    expect(getPushSupport(undefined, undefined).kind).toBe('unsupported');
  });
  it('asks iOS visitors to install the app first, even though PushManager is missing in Safari', () => {
    expect(getPushSupport(win({ push: false }), nav({ userAgent: IPHONE }))).toMatchObject({
      kind: 'ios-install',
      ios: true,
    });
  });
  it('is ready on iOS once the app is installed', () => {
    expect(getPushSupport(win({ standalone: true }), nav({ userAgent: IPHONE })).kind).toBe('ready');
  });
});

describe('currentPermission', () => {
  it('reads Notification.permission and treats a missing API as denied', () => {
    expect(currentPermission(win({ permission: 'granted' }))).toBe('granted');
    expect(currentPermission(win({ notification: false }))).toBe('denied');
  });
});
