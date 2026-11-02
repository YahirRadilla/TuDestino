import {
  OUTBOX_STATUS,
  claimEntry,
  listEntries,
  markFailed,
  markQueued,
  markSent,
  removeEntry,
} from '../../storage/outbox.js';
import { sendReport } from './reportSender.js';

// Delivery loop over the outbox, run by the page (online event, app open, "Reintentar ahora") and
// by the service worker (`sync` event). Both use the same code and the same atomic claim, so a
// report is never sent twice even when the two race.

const EMPTY_SUMMARY = () => ({ sent: 0, failed: 0, retry: 0, skipped: 0 });
const OFFLINE_KINDS = new Set(['offline', 'network', 'timeout']);

let inFlight = null;

/**
 * Sends every deliverable entry, one at a time (photos are heavy, and a dead connection should
 * stop the loop at the first miss instead of failing each report in turn).
 *
 * `skipSessionBound`: the service worker has no session, so it leaves entries that must be sent
 * as the signed-in user for the page.
 */
export async function flushOutbox({ send = sendReport, skipSessionBound = false, onChange } = {}) {
  // Overlapping calls in the same context share one run.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const summary = EMPTY_SUMMARY();
    const entries = await listEntries();
    let connectionLost = false;
    for (const entry of entries) {
      if (entry.status === OUTBOX_STATUS.failed || entry.status === OUTBOX_STATUS.sent) continue;
      if (connectionLost) {
        summary.retry += 1;
        continue;
      }
      if (skipSessionBound && entry.needsSession) {
        summary.skipped += 1;
        continue;
      }
      const claimed = await claimEntry(entry.id);
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      onChange?.();
      const result = await send(claimed);
      if (result.outcome === 'sent') {
        await markSent(claimed.id, result.receipt);
        summary.sent += 1;
      } else if (result.outcome === 'failed') {
        await markFailed(claimed.id, result.reason);
        summary.failed += 1;
      } else {
        await markQueued(claimed.id, result.reason);
        summary.retry += 1;
        connectionLost = OFFLINE_KINDS.has(result.kind);
      }
      onChange?.();
    }
    return summary;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Delivers one entry right now (the user pressed "Enviar" while online). On success the entry is
 * removed: the receipt goes straight to the screen, so the tracking code is not kept on the device.
 */
export async function sendEntryNow(id, { send = sendReport } = {}) {
  const claimed = await claimEntry(id);
  if (!claimed) return { outcome: 'busy' };
  const result = await send(claimed);
  if (result.outcome === 'sent') {
    await removeEntry(id);
    return result;
  }
  if (result.outcome === 'failed') await markFailed(id, result.reason);
  else await markQueued(id, result.reason);
  return result;
}
