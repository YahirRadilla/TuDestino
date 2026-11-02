// What this browser can do about Web Push, decided from plain inputs so it is easy to test.
// Kinds: 'ios-install' | 'unsupported' | 'ready'.

export function isIos({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isStandalone(win = globalThis.window, nav = globalThis.navigator) {
  return Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true);
}

export function getPushSupport(win = globalThis.window, nav = globalThis.navigator) {
  if (!win || !nav) return { kind: 'unsupported', ios: false, standalone: false };
  const ios = isIos(nav);
  const standalone = isStandalone(win, nav);
  // iOS and iPadOS only expose Web Push to a web app added to the Home Screen (16.4+).
  if (ios && !standalone) return { kind: 'ios-install', ios, standalone };
  const capable = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  return { kind: capable ? 'ready' : 'unsupported', ios, standalone };
}

export const currentPermission = (win = globalThis.window) =>
  win && 'Notification' in win ? win.Notification.permission : 'denied';
