import { STORES, safely } from './db.js';
import { OUTBOX_STATUS, STALE_SENDING_MS, readBytes } from './outbox.js';

// Re-export so consumers that only deal with proposals don't need to know about the report outbox.
export { OUTBOX_STATUS };

// Offline queue for event proposals (RF20). It mirrors the report outbox: the proposal is written
// here first, claimed atomically before sending, and only removed after the API accepts it.
// Proposals always need the signed-in user, so only the page delivers them; the service worker
// leaves them untouched.
//
// Entry: { id, clientUuid, payload, image: { name, type, data: ArrayBuffer } | null, needsSession,
//          status, attempts, claimedAt, lastError, receipt, createdAt, updatedAt }

const nowMs = () => Date.now();

async function toStoredImage(file) {
  return { name: file.name ?? 'evento.jpg', type: file.type || 'image/jpeg', data: await readBytes(file) };
}

/**
 * Saves a proposal for sending. Re-queuing the same `clientUuid` replaces the previous attempt
 * (so correcting a rejected proposal never creates a second entry). Returns the entry id, or null
 * when IndexedDB is unavailable.
 */
export async function enqueueProposal({
  clientUuid,
  payload,
  image = null,
  needsSession = true,
  now = nowMs,
}) {
  const stored = image ? await toStoredImage(image) : null;
  return safely(async (db) => {
    const tx = db.transaction(STORES.proposals, 'readwrite');
    const existing = (await tx.store.getAll()).find((entry) => entry.clientUuid === clientUuid);
    const timestamp = now();
    const id = await tx.store.put({
      ...(existing ? { id: existing.id } : {}),
      clientUuid,
      payload,
      image: stored,
      needsSession,
      status: OUTBOX_STATUS.queued,
      attempts: 0,
      claimedAt: null,
      lastError: null,
      receipt: null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    await tx.done;
    return id;
  }, null);
}

export const getProposalEntry = (id) => safely((db) => db.get(STORES.proposals, id), undefined);

export async function listProposalEntries() {
  const entries = await safely((db) => db.getAll(STORES.proposals), []);
  return entries.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
}

export const countProposalEntries = () => safely((db) => db.count(STORES.proposals), 0);

async function update(id, change) {
  return safely(async (db) => {
    const tx = db.transaction(STORES.proposals, 'readwrite');
    const entry = await tx.store.get(id);
    const next = entry ? change(entry) : null;
    if (next) await tx.store.put({ ...next, updatedAt: nowMs() });
    await tx.done;
    return next ?? null;
  }, null);
}

/** Takes the entry for sending. Returns it when the claim succeeded, null when someone else has it. */
export function claimProposalEntry(id, { now = nowMs } = {}) {
  return update(id, (entry) => {
    const stale = entry.status === OUTBOX_STATUS.sending && now() - (entry.claimedAt ?? 0) > STALE_SENDING_MS;
    if (entry.status !== OUTBOX_STATUS.queued && !stale) return null;
    return {
      ...entry,
      status: OUTBOX_STATUS.sending,
      claimedAt: now(),
      attempts: entry.attempts + 1,
    };
  });
}

export const markProposalFailed = (id, reason) =>
  update(id, (entry) => ({
    ...entry,
    status: OUTBOX_STATUS.failed,
    claimedAt: null,
    lastError: reason,
  }));

export const markProposalQueued = (id, reason = null) =>
  update(id, (entry) => ({
    ...entry,
    status: OUTBOX_STATUS.queued,
    claimedAt: null,
    lastError: reason,
  }));

export const retryProposalEntry = (id) =>
  update(id, (entry) =>
    entry.status === OUTBOX_STATUS.failed
      ? { ...entry, status: OUTBOX_STATUS.queued, attempts: 0, lastError: null }
      : null,
  );

export const removeProposalEntry = (id) => safely((db) => db.delete(STORES.proposals, id), undefined);
