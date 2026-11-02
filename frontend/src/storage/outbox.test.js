import { describe, expect, it } from 'vitest';
import {
  OUTBOX_STATUS,
  STALE_SENDING_MS,
  claimEntry,
  countEntries,
  enqueueReport,
  getEntry,
  listEntries,
  markFailed,
  markQueued,
  markSent,
  removeEntry,
  retryEntry,
} from './outbox.js';
import {
  UUID_A,
  UUID_B,
  photoFile,
  queueReport,
  reportPayload,
  sentReceipt,
} from '../test/reportFixtures.js';

describe('outbox', () => {
  it('queues a report with its photos as raw bytes (no Blob inside IndexedDB)', async () => {
    const id = await queueReport({
      photos: [photoFile('a.jpg', 'image/jpeg', 4), photoFile('b.png', 'image/png', 6)],
      needsSession: true,
    });
    const entry = await getEntry(id);
    expect(entry).toMatchObject({
      clientUuid: UUID_A,
      status: OUTBOX_STATUS.queued,
      attempts: 0,
      needsSession: true,
      receipt: null,
      lastError: null,
    });
    expect(entry.photos).toHaveLength(2);
    expect(entry.photos[0]).toMatchObject({ name: 'a.jpg', type: 'image/jpeg' });
    expect(entry.photos[1].data.byteLength).toBe(6);
    expect(entry.payload.description).toContain('Basura');
  });

  it('lists entries oldest first and counts them', async () => {
    await queueReport({ clientUuid: UUID_A, now: () => 2000 });
    await queueReport({ clientUuid: UUID_B, now: () => 1000 });
    expect((await listEntries()).map((entry) => entry.clientUuid)).toEqual([UUID_B, UUID_A]);
    expect(await countEntries()).toBe(2);
  });

  it('re-queuing the same client_uuid replaces the attempt instead of duplicating it', async () => {
    const first = await queueReport({ now: () => 1000 });
    await markFailed(first, 'rechazado');
    const second = await queueReport({
      payload: reportPayload({ description: 'Texto corregido del reporte.' }),
      now: () => 5000,
    });
    expect(second).toBe(first);
    const entry = await getEntry(first);
    expect(await countEntries()).toBe(1);
    expect(entry).toMatchObject({ status: 'queued', lastError: null, createdAt: 1000 });
    expect(entry.payload.description).toBe('Texto corregido del reporte.');
  });

  it('does not touch an entry that was already delivered', async () => {
    const id = await queueReport();
    await claimEntry(id);
    await markSent(id, sentReceipt());
    expect(await queueReport()).toBe(id);
    expect((await getEntry(id)).status).toBe(OUTBOX_STATUS.sent);
  });

  describe('claim', () => {
    it('is exclusive: only one context wins an entry', async () => {
      const id = await queueReport();
      const [a, b] = await Promise.all([claimEntry(id), claimEntry(id)]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      const entry = await getEntry(id);
      expect(entry).toMatchObject({ status: 'sending', attempts: 1 });
    });

    it('refuses failed and delivered entries', async () => {
      const failed = await queueReport({ clientUuid: UUID_A });
      await markFailed(failed, 'no');
      const sent = await queueReport({ clientUuid: UUID_B });
      await claimEntry(sent);
      await markSent(sent, sentReceipt());
      expect(await claimEntry(failed)).toBeNull();
      expect(await claimEntry(sent)).toBeNull();
    });

    it('takes over an abandoned claim only after it goes stale', async () => {
      const id = await queueReport();
      await claimEntry(id, { now: () => 10_000 });
      expect(await claimEntry(id, { now: () => 10_000 + STALE_SENDING_MS - 1 })).toBeNull();
      const taken = await claimEntry(id, { now: () => 10_000 + STALE_SENDING_MS + 1 });
      expect(taken).toMatchObject({ status: 'sending', attempts: 2 });
    });

    it('returns null for an entry that no longer exists', async () => {
      expect(await claimEntry(999)).toBeNull();
    });
  });

  describe('outcomes', () => {
    it('markSent keeps only the receipt and the type, dropping body and photos', async () => {
      const id = await queueReport({ photos: [photoFile()] });
      await claimEntry(id);
      await markSent(id, sentReceipt());
      const entry = await getEntry(id);
      expect(entry).toMatchObject({
        status: 'sent',
        receipt: { folio: 'TD-2026-000042', trackingCode: 'ABCDE23456' },
        photos: [],
        payload: { type: 'contaminacion' },
      });
      expect(entry.payload.description).toBeUndefined();
      expect(entry.payload.lat).toBeUndefined();
    });

    it('markFailed records the reason and markQueued returns it to the line', async () => {
      const id = await queueReport();
      await claimEntry(id);
      await markFailed(id, 'Solo se aceptan fotos válidas.');
      expect(await getEntry(id)).toMatchObject({
        status: 'failed',
        lastError: 'Solo se aceptan fotos válidas.',
      });
      const other = await queueReport({ clientUuid: UUID_B });
      await claimEntry(other);
      await markQueued(other, 'Sin conexión.');
      expect(await getEntry(other)).toMatchObject({
        status: 'queued',
        lastError: 'Sin conexión.',
        claimedAt: null,
      });
    });

    it('retryEntry only revives a failed entry and resets its counters', async () => {
      const id = await queueReport();
      await claimEntry(id);
      expect(await retryEntry(id)).toBeNull();
      await markFailed(id, 'x');
      expect(await retryEntry(id)).toMatchObject({ status: 'queued', attempts: 0, lastError: null });
    });

    it('removeEntry deletes it', async () => {
      const id = await queueReport();
      await removeEntry(id);
      expect(await getEntry(id)).toBeUndefined();
    });
  });

  it('reports failure to save (null) when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    // `idb` calls indexedDB.open: make it blow up like a blocked/private-mode browser.
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(await enqueueReport({ clientUuid: UUID_A, payload: reportPayload(), photos: [] })).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });
});
