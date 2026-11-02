import { isOutboxChangedMessage } from '../../pwa/reportSync.js';

// "The outbox changed": tells every screen (in this tab, other tabs and the service worker) to
// reload its view. IndexedDB has no change feed, so the writers announce it. A BroadcastChannel
// reaches every context of the origin (including other instances in this tab); without it a plain
// window event covers the current tab.

const EVENT = 'td:outbox-changed';
const CHANNEL = 'td-outbox';

const hasChannel = () => typeof BroadcastChannel !== 'undefined';

export function notifyOutboxChanged() {
  if (!hasChannel()) {
    window.dispatchEvent(new Event(EVENT));
    return;
  }
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage('changed');
  channel.close();
}

/** Calls `callback` on every change; returns the unsubscribe function. */
export function onOutboxChanged(callback) {
  const channel = hasChannel() ? new BroadcastChannel(CHANNEL) : null;
  const fromWorker = (event) => {
    if (isOutboxChangedMessage(event.data)) callback();
  };
  channel?.addEventListener('message', callback);
  if (!channel) window.addEventListener(EVENT, callback);
  navigator.serviceWorker?.addEventListener('message', fromWorker);
  return () => {
    channel?.close();
    if (!channel) window.removeEventListener(EVENT, callback);
    navigator.serviceWorker?.removeEventListener('message', fromWorker);
  };
}
