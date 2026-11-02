import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, setAuthHandlers, toQueryString } from './client.js';

afterEach(() => vi.unstubAllGlobals());

const abortableFetch = () =>
  vi.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      }),
  );

describe("apiFetch with auth: 'optional'", () => {
  it('sends the token when there is one and never tries to refresh on a 401', async () => {
    const refresh = vi.fn();
    const restore = setAuthHandlers({ getAccessToken: () => 'tok', refresh });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/events', { auth: 'optional' })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(refresh).not.toHaveBeenCalled();
    restore();
  });

  it('sends no Authorization header when the visitor has no session', async () => {
    const restore = setAuthHandlers({ getAccessToken: () => null, refresh: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/events', { auth: 'optional' });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    restore();
  });
});

describe('toQueryString', () => {
  it('skips empty values and encodes the rest', () => {
    expect(toQueryString({ q: 'playa norte', page: 2, category: '', near: undefined })).toBe(
      '?q=playa+norte&page=2',
    );
  });

  it('returns an empty string when there is nothing to send', () => {
    expect(toQueryString({})).toBe('');
    expect(toQueryString()).toBe('');
  });
});

describe('apiFetch', () => {
  it('appends params to the URL and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/destinations', { params: { limit: 3 } })).resolves.toEqual({ data: [] });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/destinations\?limit=3$/);
  });

  it('throws a typed http error carrying status and code', async () => {
    const body = JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No existe' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 404 })));
    await expect(apiFetch('/x')).rejects.toMatchObject({
      kind: 'http',
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws a network error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('cancels the request when the caller aborts and reports kind "aborted"', async () => {
    vi.stubGlobal('fetch', abortableFetch());
    const controller = new AbortController();
    const pending = apiFetch('/x', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('reports a timeout when the server takes too long', async () => {
    vi.stubGlobal('fetch', abortableFetch());
    await expect(apiFetch('/x', { timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('always sends credentials so the refresh cookie travels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/x');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('apiFetch with auth', () => {
  let restore;
  afterEach(() => restore?.());

  const unauthorized = () =>
    new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'No' } }), { status: 401 });
  const ok = () => new Response(JSON.stringify({ data: 1 }));

  it('does not attach the token unless auth is requested', async () => {
    restore = setAuthHandlers({ getAccessToken: () => 'tok' });
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/public');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('sends the bearer token when auth is requested', async () => {
    restore = setAuthHandlers({ getAccessToken: () => 'tok' });
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/me', { auth: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('on 401 renews the session once and retries once with the new token', async () => {
    const refresh = vi.fn().mockResolvedValue('fresh');
    restore = setAuthHandlers({ getAccessToken: () => 'old', refresh });
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/me', { auth: true })).resolves.toEqual({ data: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('never loops: a second 401 after the retry is surfaced', async () => {
    const refresh = vi.fn().mockResolvedValue('fresh');
    restore = setAuthHandlers({ getAccessToken: () => 'old', refresh });
    const fetchMock = vi.fn().mockImplementation(async () => unauthorized());
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/me', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the original 401 when the session cannot be renewed', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('revoked'));
    restore = setAuthHandlers({ getAccessToken: () => 'old', refresh });
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/me', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not try to renew on non-401 errors', async () => {
    const refresh = vi.fn();
    restore = setAuthHandlers({ getAccessToken: () => 'old', refresh });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(apiFetch('/admin', { auth: true })).rejects.toMatchObject({ status: 403 });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("apiFetch with responseType: 'blob'", () => {
  it('returns the binary body of a successful answer', async () => {
    const restore = setAuthHandlers({ getAccessToken: () => 'tok', refresh: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('abc', { status: 200, headers: { 'Content-Type': 'image/webp' } })),
    );
    const blob = await apiFetch('/admin/reports/1/evidences/2', { auth: true, responseType: 'blob' });
    expect(blob.size).toBe(3);
    expect(blob.type).toBe('image/webp');
    expect(typeof blob.arrayBuffer).toBe('function');
    restore();
  });

  it('still reads errors as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidencia no encontrada.' } }),
          {
            status: 404,
          },
        ),
      ),
    );
    await expect(apiFetch('/x', { responseType: 'blob' })).rejects.toMatchObject({
      status: 404,
      code: 'EVIDENCE_NOT_FOUND',
      message: 'Evidencia no encontrada.',
    });
  });
});
