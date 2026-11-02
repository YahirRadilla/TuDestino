import { describe, expect, it, vi } from 'vitest';
import { OUTBOX_STATUS, claimEntry, getEntry, listEntries, markFailed } from '../../storage/outbox.js';
import { UUID_A, UUID_B, queueReport, sentReceipt } from '../../test/reportFixtures.js';
import { flushOutbox, sendEntryNow } from './reportQueue.js';

const sent = (folio = 'TD-2026-000042') => ({
  outcome: 'sent',
  receipt: sentReceipt({ folio }),
});

describe('flushOutbox', () => {
  it('delivers every queued report and keeps the receipt for the user', async () => {
    const a = await queueReport({ clientUuid: UUID_A, now: () => 1 });
    const b = await queueReport({ clientUuid: UUID_B, now: () => 2 });
    const send = vi.fn(async (entry) => sent(`TD-2026-00000${entry.id}`));
    const summary = await flushOutbox({ send });
    expect(summary).toEqual({ sent: 2, failed: 0, retry: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect((await getEntry(a)).receipt.folio).toBe(`TD-2026-00000${a}`);
    expect((await getEntry(b)).status).toBe(OUTBOX_STATUS.sent);
  });

  it('marks a refused report as failed and keeps going with the rest', async () => {
    const bad = await queueReport({ clientUuid: UUID_A, now: () => 1 });
    const good = await queueReport({ clientUuid: UUID_B, now: () => 2 });
    const send = vi.fn(async (entry) =>
      entry.id === bad ? { outcome: 'failed', reason: 'Foto no válida.' } : sent(),
    );
    const summary = await flushOutbox({ send });
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    expect(await getEntry(bad)).toMatchObject({ status: 'failed', lastError: 'Foto no válida.' });
    expect((await getEntry(good)).status).toBe('sent');
  });

  it('does not retry a failed report on later runs', async () => {
    const id = await queueReport();
    await claimEntry(id);
    await markFailed(id, 'no');
    const send = vi.fn();
    expect(await flushOutbox({ send })).toMatchObject({ sent: 0, failed: 0, retry: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('puts a transient failure back in the queue and stops at the first lost connection', async () => {
    await queueReport({ clientUuid: UUID_A, now: () => 1 });
    await queueReport({ clientUuid: UUID_B, now: () => 2 });
    const send = vi.fn(async () => ({ outcome: 'retry', reason: 'Sin conexión.', kind: 'offline' }));
    const summary = await flushOutbox({ send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ sent: 0, retry: 2 });
    const entries = await listEntries();
    expect(entries.map((entry) => entry.status)).toEqual(['queued', 'queued']);
    expect(entries[0]).toMatchObject({ lastError: 'Sin conexión.', attempts: 1 });
    expect(entries[1].attempts).toBe(0);
  });

  it('keeps going after a server-side hiccup on one report', async () => {
    await queueReport({ clientUuid: UUID_A, now: () => 1 });
    await queueReport({ clientUuid: UUID_B, now: () => 2 });
    const send = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'retry', reason: 'Error del servidor.', kind: 'http' })
      .mockResolvedValueOnce(sent());
    expect(await flushOutbox({ send })).toMatchObject({ sent: 1, retry: 1 });
  });

  it('the service worker leaves session-bound reports for the page', async () => {
    const linked = await queueReport({ clientUuid: UUID_A, needsSession: true, now: () => 1 });
    const anon = await queueReport({ clientUuid: UUID_B, now: () => 2 });
    const send = vi.fn(async () => sent());
    const summary = await flushOutbox({ send, skipSessionBound: true });
    expect(summary).toMatchObject({ sent: 1, skipped: 1 });
    expect((await getEntry(linked)).status).toBe('queued');
    expect((await getEntry(anon)).status).toBe('sent');
  });

  it('a report is sent once even when the page and the worker flush at the same time', async () => {
    await queueReport();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const send = vi.fn(async () => {
      await gate;
      return sent();
    });
    // Two separate contexts share IndexedDB but not memory: simulate the second one with a
    // direct claim on the same entry while the first is mid-flight.
    const first = flushOutbox({ send });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [entry] = await listEntries();
    expect(await claimEntry(entry.id)).toBeNull();
    release();
    expect(await first).toMatchObject({ sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('overlapping flushes in one context share a single run', async () => {
    await queueReport();
    const send = vi.fn(async () => sent());
    const [a, b] = await Promise.all([flushOutbox({ send }), flushOutbox({ send })]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('announces each state change', async () => {
    await queueReport();
    const onChange = vi.fn();
    await flushOutbox({ send: async () => sent(), onChange });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('sendEntryNow', () => {
  it('removes a delivered entry: the receipt goes to the screen, not to storage', async () => {
    const id = await queueReport();
    const result = await sendEntryNow(id, { send: async () => sent() });
    expect(result.outcome).toBe('sent');
    expect(await getEntry(id)).toBeUndefined();
  });

  it('leaves a refused entry as failed and a transient one queued', async () => {
    const failing = await queueReport({ clientUuid: UUID_A });
    await sendEntryNow(failing, { send: async () => ({ outcome: 'failed', reason: 'No.' }) });
    expect(await getEntry(failing)).toMatchObject({ status: 'failed', lastError: 'No.' });

    const flaky = await queueReport({ clientUuid: UUID_B });
    await sendEntryNow(flaky, {
      send: async () => ({ outcome: 'retry', reason: 'Sin conexión.', kind: 'offline' }),
    });
    expect(await getEntry(flaky)).toMatchObject({ status: 'queued', lastError: 'Sin conexión.' });
  });

  it('reports "busy" when someone else already took the entry', async () => {
    const id = await queueReport();
    await claimEntry(id);
    const send = vi.fn();
    expect(await sendEntryNow(id, { send })).toEqual({ outcome: 'busy' });
    expect(send).not.toHaveBeenCalled();
  });
});
