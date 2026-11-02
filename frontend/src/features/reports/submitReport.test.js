import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEntry, listEntries } from '../../storage/outbox.js';
import { UUID_A, photoFile, reportPayload, sentReceipt } from '../../test/reportFixtures.js';
import { submitReport } from './submitReport.js';

const base = (overrides = {}) => ({
  clientUuid: UUID_A,
  payload: reportPayload(),
  photos: [photoFile()],
  needsSession: false,
  ...overrides,
});

const sentResult = { outcome: 'sent', receipt: sentReceipt() };

afterEach(() => vi.unstubAllGlobals());

describe('submitReport', () => {
  it('always saves first: the entry exists while the request is in flight', async () => {
    let seenDuringSend;
    const send = vi.fn(async () => {
      seenDuringSend = await listEntries();
      return sentResult;
    });
    const result = await submitReport(base(), { online: true, send, register: vi.fn() });
    expect(seenDuringSend).toHaveLength(1);
    expect(seenDuringSend[0]).toMatchObject({ clientUuid: UUID_A, status: 'sending' });
    expect(result).toEqual({ phase: 'sent', receipt: sentResult.receipt });
    expect(await listEntries()).toEqual([]);
  });

  it('offline: queues without touching the network and registers a background sync', async () => {
    const send = vi.fn();
    const register = vi.fn().mockResolvedValue(true);
    const result = await submitReport(base(), { online: false, send, register });
    expect(send).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ phase: 'queued', syncRegistered: true });
    expect((await getEntry(result.id)).status).toBe('queued');
  });

  it('without Background Sync support the report is queued and the page fallback applies', async () => {
    const result = await submitReport(base(), {
      online: false,
      send: vi.fn(),
      register: vi.fn().mockResolvedValue(false),
    });
    expect(result).toMatchObject({ phase: 'queued', syncRegistered: false });
  });

  it('a transient failure keeps the report queued', async () => {
    const send = vi.fn(async () => ({ outcome: 'retry', reason: 'Error del servidor.', kind: 'http' }));
    const result = await submitReport(base(), {
      online: true,
      send,
      register: vi.fn().mockResolvedValue(true),
    });
    expect(result.phase).toBe('queued');
    expect(await getEntry(result.id)).toMatchObject({ status: 'queued', lastError: 'Error del servidor.' });
  });

  it('a refusal comes back as failed with the reason and stays in the outbox', async () => {
    const send = vi.fn(async () => ({ outcome: 'failed', reason: 'description: demasiado corta' }));
    const result = await submitReport(base(), { online: true, send, register: vi.fn() });
    expect(result).toMatchObject({ phase: 'failed', reason: 'description: demasiado corta' });
    expect(await getEntry(result.id)).toMatchObject({ status: 'failed' });
  });

  it('submitting the same report twice never creates two entries', async () => {
    const offline = { online: false, send: vi.fn(), register: vi.fn() };
    await submitReport(base(), offline);
    await submitReport(base(), offline);
    expect(await listEntries()).toHaveLength(1);
  });

  describe('when IndexedDB is unavailable', () => {
    const blockIndexedDb = () =>
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        get() {
          throw new Error('blocked');
        },
      });
    const restore = (original) =>
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        writable: true,
        value: original,
      });

    it('sends straight away when there is a connection', async () => {
      const original = globalThis.indexedDB;
      blockIndexedDb();
      try {
        const send = vi.fn(async () => sentResult);
        const result = await submitReport(base(), { online: true, send, register: vi.fn() });
        expect(result.phase).toBe('sent');
        expect(send.mock.calls[0][0].photos[0].data).toBeInstanceOf(ArrayBuffer);
      } finally {
        restore(original);
      }
    });

    it('explains that nothing could be saved when there is no connection either', async () => {
      const original = globalThis.indexedDB;
      blockIndexedDb();
      try {
        const result = await submitReport(base(), { online: false, send: vi.fn(), register: vi.fn() });
        expect(result.phase).toBe('error');
        expect(result.reason).toMatch(/No pudimos guardar/);
      } finally {
        restore(original);
      }
    });
  });
});
