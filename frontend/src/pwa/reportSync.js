// Background Sync for the report outbox (PWA-13). Pure decisions and thin wrappers, kept free of
// Workbox and of `self` so they can be unit tested; the worker (src/sw.js) only wires them up.

export const REPORTS_SYNC_TAG = 'reports-outbox';
export const OUTBOX_CHANGED_MESSAGE = 'REPORTS_OUTBOX_CHANGED';

export const isReportsSyncEvent = (event) => event?.tag === REPORTS_SYNC_TAG;

export const isOutboxChangedMessage = (data) => data?.type === OUTBOX_CHANGED_MESSAGE;

/**
 * Body of the worker's `sync` listener. Always tells the open pages what happened. When something
 * could not be delivered because of the network or a server error it throws, which is how the
 * browser learns it must schedule another attempt (with its own back-off).
 */
export async function handleReportsSync({ flush, notify }) {
  let summary;
  try {
    summary = await flush({ skipSessionBound: true });
  } finally {
    await notify(summary);
  }
  if (summary.retry > 0) {
    throw new Error(`${REPORTS_SYNC_TAG}: ${summary.retry} report(s) still queued`);
  }
  return summary;
}

// ---- Page side ----

export const isBackgroundSyncSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'SyncManager' in window;

/**
 * Asks the browser to wake the worker when the connection returns. Resolves true when the sync was
 * registered; false means the page-side fallback (online event, app open, manual retry) applies.
 */
export async function registerReportsSync() {
  if (!isBackgroundSyncSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register(REPORTS_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}
