import {
  OUTBOX_STATUS,
  claimProposalEntry,
  listProposalEntries,
  markProposalFailed,
  markProposalQueued,
  removeProposalEntry,
} from '../../storage/proposalOutbox.js';
import { sendEventProposal } from './proposalSender.js';

// Delivery loop over the event-proposal outbox. It follows the report queue: one entry at a time,
// atomic claim, transient errors stay queued. The page is the only sender because every proposal
// needs the signed-in session.

const EMPTY_SUMMARY = () => ({ sent: 0, failed: 0, retry: 0, skipped: 0 });
const OFFLINE_KINDS = new Set(['offline', 'network', 'timeout']);

let inFlight = null;

export async function flushProposalOutbox({
  send = sendEventProposal,
  skipSessionBound = false,
  onChange,
} = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const summary = EMPTY_SUMMARY();
    const entries = await listProposalEntries();
    let connectionLost = false;
    for (const entry of entries) {
      if (entry.status === OUTBOX_STATUS.failed) continue;
      if (connectionLost) {
        summary.retry += 1;
        continue;
      }
      if (skipSessionBound && entry.needsSession) {
        summary.skipped += 1;
        continue;
      }
      const claimed = await claimProposalEntry(entry.id);
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      onChange?.();
      const result = await send(claimed);
      if (result.outcome === 'sent') {
        await removeProposalEntry(claimed.id);
        summary.sent += 1;
      } else if (result.outcome === 'failed') {
        await markProposalFailed(claimed.id, result.reason);
        summary.failed += 1;
      } else {
        await markProposalQueued(claimed.id, result.reason);
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

/** Delivers one proposal right now; success removes it because the page shows the result. */
export async function sendProposalNow(id, { send = sendEventProposal } = {}) {
  const claimed = await claimProposalEntry(id);
  if (!claimed) return { outcome: 'busy' };
  const result = await send(claimed);
  if (result.outcome === 'sent') {
    await removeProposalEntry(id);
    return result;
  }
  if (result.outcome === 'failed') await markProposalFailed(id, result.reason);
  else await markProposalQueued(id, result.reason);
  return result;
}
