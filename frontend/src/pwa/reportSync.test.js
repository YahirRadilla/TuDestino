import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OUTBOX_CHANGED_MESSAGE,
  REPORTS_SYNC_TAG,
  handleReportsSync,
  isBackgroundSyncSupported,
  isOutboxChangedMessage,
  isReportsSyncEvent,
  registerReportsSync,
} from './reportSync.js';

afterEach(() => vi.unstubAllGlobals());

describe('service worker side', () => {
  it('only reacts to the reports tag', () => {
    expect(REPORTS_SYNC_TAG).toBe('reports-outbox');
    expect(isReportsSyncEvent({ tag: 'reports-outbox' })).toBe(true);
    expect(isReportsSyncEvent({ tag: 'other' })).toBe(false);
    expect(isReportsSyncEvent(undefined)).toBe(false);
  });

  it('flushes without a session, notifies the pages and resolves when nothing is left', async () => {
    const summary = { sent: 2, failed: 0, retry: 0, skipped: 0 };
    const flush = vi.fn().mockResolvedValue(summary);
    const notify = vi.fn().mockResolvedValue();
    await expect(handleReportsSync({ flush, notify })).resolves.toBe(summary);
    expect(flush).toHaveBeenCalledWith({ skipSessionBound: true });
    expect(notify).toHaveBeenCalledWith(summary);
  });

  it('rejects when reports are still queued so the browser schedules another attempt', async () => {
    const flush = vi.fn().mockResolvedValue({ sent: 1, failed: 0, retry: 2, skipped: 0 });
    const notify = vi.fn().mockResolvedValue();
    await expect(handleReportsSync({ flush, notify })).rejects.toThrow(/2 report/);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a validation failure is final: it does not ask the browser to retry', async () => {
    const flush = vi.fn().mockResolvedValue({ sent: 0, failed: 1, retry: 0, skipped: 0 });
    await expect(handleReportsSync({ flush, notify: vi.fn() })).resolves.toMatchObject({ failed: 1 });
  });

  it('still notifies the pages when the flush itself throws', async () => {
    const notify = vi.fn().mockResolvedValue();
    await expect(
      handleReportsSync({ flush: vi.fn().mockRejectedValue(new Error('idb')), notify }),
    ).rejects.toThrow('idb');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('recognises the message that tells pages to reload the outbox', () => {
    expect(isOutboxChangedMessage({ type: OUTBOX_CHANGED_MESSAGE })).toBe(true);
    expect(isOutboxChangedMessage({ type: 'SKIP_WAITING' })).toBe(false);
    expect(isOutboxChangedMessage(null)).toBe(false);
  });
});

describe('page side', () => {
  it('registers the sync tag when the browser supports Background Sync', async () => {
    const register = vi.fn().mockResolvedValue();
    vi.stubGlobal('SyncManager', class {});
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { ready: Promise.resolve({ sync: { register } }) },
    });
    expect(isBackgroundSyncSupported()).toBe(true);
    await expect(registerReportsSync()).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('reports-outbox');
  });

  it('reports false (use the page fallback) without SyncManager', async () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { ready: Promise.resolve({}) } });
    expect(isBackgroundSyncSupported()).toBe(false);
    await expect(registerReportsSync()).resolves.toBe(false);
  });

  it('reports false when registration is refused', async () => {
    vi.stubGlobal('SyncManager', class {});
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: {
        ready: Promise.resolve({ sync: { register: vi.fn().mockRejectedValue(new Error('denied')) } }),
      },
    });
    await expect(registerReportsSync()).resolves.toBe(false);
  });
});
