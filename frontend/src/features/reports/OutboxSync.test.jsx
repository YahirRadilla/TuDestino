import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthContext } from '../auth/authContext.js';
import { getEntry } from '../../storage/outbox.js';
import { json, stubApi } from '../../test/apiStub.js';
import { UUID_A, queueReport } from '../../test/reportFixtures.js';
import OutboxSync from './OutboxSync.jsx';

const created = () =>
  json({ data: { folio: 'TD-2026-000009', tracking_code: 'ABCDE23456', replayed: false } }, 201);

const renderSync = (status = 'anonymous') =>
  render(
    <AuthContext.Provider value={{ status, user: null, isAuthenticated: false }}>
      <OutboxSync />
    </AuthContext.Provider>,
  );

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OutboxSync (page fallback when Background Sync is missing)', () => {
  it('sends what is waiting as soon as the app opens with a connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({ 'POST /reports': () => created() });
    const id = await queueReport();
    renderSync();
    await waitFor(async () => expect((await getEntry(id)).status).toBe('sent'));
    expect(api.count('POST /reports')).toBe(1);
  });

  it('does nothing while offline and sends when the "online" event fires', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const api = stubApi({ 'POST /reports': () => created() });
    const id = await queueReport();
    renderSync();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(api.count('POST /reports')).toBe(0);
    expect((await getEntry(id)).status).toBe('queued');

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(async () => expect((await getEntry(id)).status).toBe('sent'));
    expect(api.count('POST /reports')).toBe(1);
  });

  it('sends when the tab becomes visible again', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    stubApi({ 'POST /reports': () => created() });
    const id = await queueReport();
    renderSync();
    online.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(async () => expect((await getEntry(id)).status).toBe('sent'));
  });

  it('waits for the session to be restored so a linked report is not sent as a visitor', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({ 'POST /reports': () => created() });
    await queueReport({ clientUuid: UUID_A, needsSession: true });
    renderSync('loading');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(api.count('POST /reports')).toBe(0);
  });

  it('stops listening when it unmounts', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({ 'POST /reports': () => created() });
    const { unmount } = renderSync();
    unmount();
    await queueReport();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(api.count('POST /reports')).toBe(0);
  });
});
