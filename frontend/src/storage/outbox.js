import { STORES, safely } from './db.js';

// Outbox of citizen reports (PWA-13): everything the user submits is written here FIRST, then sent.
// It is shared by the page and the service worker, so every state change is one IndexedDB
// transaction: two contexts can never both claim the same entry.
//
// Entry: { id, clientUuid, payload, photos: [{ name, type, data: ArrayBuffer }], needsSession,
//          status, attempts, claimedAt, lastError, receipt, createdAt, updatedAt }

export const OUTBOX_STATUS = Object.freeze({
  queued: 'queued', //   waiting for a connection (or for its turn)
  sending: 'sending', // claimed by the page or the worker
  failed: 'failed', //   rejected by the server; needs the user (retry or discard)
  sent: 'sent', //       delivered; keeps the receipt until the user has saved the tracking code
});

// A claim older than this is treated as abandoned (tab closed, worker killed mid-request).
export const STALE_SENDING_MS = 2 * 60_000;

const nowMs = () => Date.now();

// `Blob.arrayBuffer()` is missing in older Safari; FileReader works everywhere.
export function readBytes(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function toStoredPhoto(file) {
  return { name: file.name ?? 'foto.jpg', type: file.type || 'image/jpeg', data: await readBytes(file) };
}

/**
 * Saves a report for sending. Re-queuing the same `clientUuid` replaces the previous attempt
 * (so correcting a rejected report never creates a second entry). Returns the entry id, or null
 * when IndexedDB is unavailable.
 */
export async function enqueueReport({ clientUuid, payload, photos = [], needsSession = false, now = nowMs }) {
  const stored = await Promise.all(photos.map(toStoredPhoto));
  return safely(async (db) => {
    const tx = db.transaction(STORES.outbox, 'readwrite');
    const existing = (await tx.store.getAll()).find((entry) => entry.clientUuid === clientUuid);
    if (existing?.status === OUTBOX_STATUS.sent) {
      await tx.done;
      return existing.id;
    }
    const timestamp = now();
    const id = await tx.store.put({
      ...(existing ? { id: existing.id } : {}),
      clientUuid,
      payload,
      photos: stored,
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

export const getEntry = (id) => safely((db) => db.get(STORES.outbox, id), undefined);

export async function listEntries() {
  const entries = await safely((db) => db.getAll(STORES.outbox), []);
  return entries.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
}

export const countEntries = () => safely((db) => db.count(STORES.outbox), 0);

// Applies `change(entry)` atomically; `change` returns the new entry or null to leave it alone.
async function update(id, change) {
  return safely(async (db) => {
    const tx = db.transaction(STORES.outbox, 'readwrite');
    const entry = await tx.store.get(id);
    const next = entry ? change(entry) : null;
    if (next) await tx.store.put({ ...next, updatedAt: nowMs() });
    await tx.done;
    return next ?? null;
  }, null);
}

/** Takes the entry for sending. Returns it when the claim succeeded, null when someone else has it. */
export function claimEntry(id, { now = nowMs } = {}) {
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

// Once delivered, the report body and photos are dropped: only what the receipt screen needs stays.
export const markSent = (id, receipt) =>
  update(id, (entry) => ({
    ...entry,
    status: OUTBOX_STATUS.sent,
    payload: { type: entry.payload.type },
    photos: [],
    claimedAt: null,
    lastError: null,
    receipt,
  }));

export const markFailed = (id, reason) =>
  update(id, (entry) => ({
    ...entry,
    status: OUTBOX_STATUS.failed,
    claimedAt: null,
    lastError: reason,
  }));

// A transient failure (no network, 5xx): back to the queue to be tried again later.
export const markQueued = (id, reason = null) =>
  update(id, (entry) => ({
    ...entry,
    status: OUTBOX_STATUS.queued,
    claimedAt: null,
    lastError: reason,
  }));

// "Reintentar" on a rejected report.
export const retryEntry = (id) =>
  update(id, (entry) =>
    entry.status === OUTBOX_STATUS.failed
      ? { ...entry, status: OUTBOX_STATUS.queued, attempts: 0, lastError: null }
      : null,
  );

export const removeEntry = (id) => safely((db) => db.delete(STORES.outbox, id), undefined);
