import { vi } from 'vitest';

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
export const noContent = () => new Response(null, { status: 204 });
export const apiError = (status, code, message) => json({ error: { code, message } }, status);

export const testUser = {
  id: 'u-1',
  full_name: 'Ana Pérez',
  email: 'ana@example.com',
  avatar_url: null,
  role: 'user',
  area_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

export const session = (user = testUser, token = 'access-1') => ({
  data: { access_token: token, token_type: 'Bearer', expires_in: 900, user },
});

/**
 * Replaces global fetch with a router keyed by "METHOD /path" (path without /api/v1).
 * A route value is a body, a Response, or (call) => body | Response | Promise of those.
 */
export function stubApi(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init = {}) => {
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    const call = {
      method,
      path,
      search: parsed.search,
      query: Object.fromEntries(parsed.searchParams),
      authorization: init.headers?.Authorization,
      // Multipart bodies (report uploads) are handed to the test untouched.
      body: !init.body ? undefined : init.body instanceof FormData ? init.body : JSON.parse(init.body),
      credentials: init.credentials,
    };
    calls.push(call);
    const route = routes[`${method} ${path}`];
    if (!route) return apiError(404, 'NOT_FOUND', 'Ruta no encontrada.');
    const result = typeof route === 'function' ? await route(call) : route;
    return result instanceof Response ? result : json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    count: (key) => calls.filter((call) => `${call.method} ${call.path}` === key).length,
  };
}
