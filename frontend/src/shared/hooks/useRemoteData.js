import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL = {
  status: 'loading',
  data: null,
  source: null,
  reason: null,
  syncedAt: null,
  error: null,
};

/**
 * What a `fallback` returns when the data comes from the device mirror (IndexedDB) rather than
 * from bundled sample data. `syncedAt` is the ISO time the mirror was last refreshed online.
 */
export class CachedData {
  constructor(data, syncedAt = null) {
    this.data = data;
    this.syncedAt = syncedAt;
  }
}

// Why the API could not be used, or null when the failure is the caller's (4xx) and must surface.
function fallbackReason(error) {
  if (error?.kind === 'offline') return 'offline';
  const serverSide = error?.kind === 'http' && error.status >= 500;
  if (serverSide || error?.kind === 'network' || error?.kind === 'timeout') return 'unreachable';
  return null;
}

/**
 * Loads data through the API and degrades to local data when the API cannot be reached.
 * Each `key` change aborts the previous request, so a slow stale response can never win.
 *
 * `fallback` may be sync or async and may return plain data (bundled samples), a `CachedData`
 * (device mirror) or `undefined` meaning "nothing stored": then the original error shows (`null` is valid data,
 * e.g. "that item does not exist").
 * `enabled: false` keeps the hook in `loading` without requesting anything (e.g. until the
 * session is known).
 *
 * status: 'loading' | 'ready' | 'error'
 * source: 'api' | 'cache' | 'fallback'; reason: 'offline' | 'unreachable'; syncedAt: ISO | null.
 */
export function useRemoteData({ key, load, fallback, enabled = true }) {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ load, fallback });

  useEffect(() => {
    latest.current = { load, fallback };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState(INITIAL);
    const fail = (error) => setState({ ...INITIAL, status: 'error', error });

    latest.current
      .load(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ ...INITIAL, status: 'ready', data, source: 'api' });
      })
      .catch(async (error) => {
        if (controller.signal.aborted) return;
        const reason = fallbackReason(error);
        const { fallback: makeFallback } = latest.current;
        if (!reason || !makeFallback) return fail(error);
        let local;
        try {
          local = await makeFallback();
        } catch {
          local = undefined;
        }
        if (controller.signal.aborted) return undefined;
        if (local === undefined) return fail(error);
        const cached = local instanceof CachedData;
        return setState({
          ...INITIAL,
          status: 'ready',
          data: cached ? local.data : local,
          source: cached ? 'cache' : 'fallback',
          syncedAt: cached ? local.syncedAt : null,
          reason,
        });
      });
    return () => controller.abort();
  }, [key, attempt, enabled]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
