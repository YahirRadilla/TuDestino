import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../../api/client.js';
import { CachedData, useRemoteData } from './useRemoteData.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useRemoteData', () => {
  it('starts loading and exposes the API data when the request succeeds', async () => {
    const load = vi.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() => useRemoteData({ key: 'k', load }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ data: ['a'], source: 'api', reason: null });
  });

  it.each([
    ['offline', new ApiError('offline', 'x')],
    ['unreachable', new ApiError('network', 'x')],
    ['unreachable', new ApiError('timeout', 'x')],
    ['unreachable', new ApiError('http', 'x', { status: 503 })],
  ])('falls back to local data with reason "%s"', async (reason, error) => {
    const { result } = renderHook(() =>
      useRemoteData({ key: 'k', load: () => Promise.reject(error), fallback: () => ['local'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ data: ['local'], source: 'fallback', reason });
  });

  it('reports an error for client errors instead of masking them with fallback data', async () => {
    const error = new ApiError('http', 'Solicitud inválida', { status: 400 });
    const { result } = renderHook(() =>
      useRemoteData({ key: 'k', load: () => Promise.reject(error), fallback: () => ['local'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(error);
  });

  it('reports an error when there is no fallback', async () => {
    const { result } = renderHook(() =>
      useRemoteData({ key: 'k', load: () => Promise.reject(new ApiError('network', 'x')) }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('aborts the in-flight request and ignores its result when the key changes', async () => {
    const first = deferred();
    const second = deferred();
    const signals = [];
    const load = vi.fn((signal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const { result, rerender } = renderHook(({ key }) => useRemoteData({ key, load }), {
      initialProps: { key: 'one' },
    });
    rerender({ key: 'two' });
    expect(signals[0].aborted).toBe(true);
    await act(async () => {
      second.resolve(['two']);
      first.resolve(['one']);
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(['two']);
  });

  it('aborts the request on unmount', () => {
    let captured;
    const { unmount } = renderHook(() =>
      useRemoteData({
        key: 'k',
        load: (signal) => {
          captured = signal;
          return new Promise(() => {});
        },
      }),
    );
    unmount();
    expect(captured.aborted).toBe(true);
  });

  it('reload() retries after an error', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('http', 'x', { status: 400 }))
      .mockResolvedValueOnce(['ok']);
    const { result } = renderHook(() => useRemoteData({ key: 'k', load }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(['ok']);
  });

  it('falls back to the device mirror (CachedData) and exposes when it was synced', async () => {
    const syncedAt = '2026-10-17T12:00:00.000Z';
    const { result } = renderHook(() =>
      useRemoteData({
        key: 'k',
        load: () => Promise.reject(new ApiError('offline', 'x')),
        fallback: async () => new CachedData(['saved'], syncedAt),
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({
      data: ['saved'],
      source: 'cache',
      reason: 'offline',
      syncedAt,
    });
  });

  it('shows the original error when the fallback has nothing stored (undefined)', async () => {
    const error = new ApiError('offline', 'Sin conexión.');
    const { result } = renderHook(() =>
      useRemoteData({ key: 'k', load: () => Promise.reject(error), fallback: async () => undefined }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(error);
  });

  it('treats null as valid data ("that item does not exist")', async () => {
    const { result } = renderHook(() =>
      useRemoteData({
        key: 'k',
        load: () => Promise.reject(new ApiError('network', 'x')),
        fallback: async () => null,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ data: null, source: 'fallback' });
  });

  it('reports an error when the fallback itself throws', async () => {
    const { result } = renderHook(() =>
      useRemoteData({
        key: 'k',
        load: () => Promise.reject(new ApiError('network', 'x')),
        fallback: async () => {
          throw new Error('idb broke');
        },
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('does not request anything while disabled and loads once enabled', async () => {
    const load = vi.fn().mockResolvedValue(['a']);
    const { result, rerender } = renderHook(({ enabled }) => useRemoteData({ key: 'k', load, enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.status).toBe('loading');
    expect(load).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
