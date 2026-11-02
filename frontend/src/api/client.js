import { API_BASE } from './base.js';

// Single entry point for every fetch (PWA-04): timeout, typed errors, offline detection.
// Also loaded by the service worker (background sync), so it must not touch the DOM at import time.
export { API_BASE };

export class ApiError extends Error {
  constructor(kind, message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind; // 'offline' | 'timeout' | 'http' | 'network' | 'aborted'
    this.status = status;
    this.code = code;
  }
}

// Builds "?a=1&b=2" skipping empty values; returns '' when nothing is left.
export function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// Session hooks registered by the auth layer (kept out of this module to avoid a dependency cycle).
// getAccessToken: () => string | null. refresh: () => Promise<string>, which must share one in-flight call.
let authHandlers = { getAccessToken: () => null, refresh: null };

// Returns a function that restores the previous handlers.
export function setAuthHandlers(handlers) {
  const previous = authHandlers;
  authHandlers = { ...authHandlers, ...handlers };
  return () => {
    authHandlers = previous;
  };
}

const isFormData = (value) => typeof FormData !== 'undefined' && value instanceof FormData;

async function request(
  path,
  { timeoutMs = 8000, headers, body, params, signal, token, responseType, ...options },
) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('offline', 'Sin conexión.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) abortFromCaller();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    const response = await fetch(`${API_BASE}${path}${toQueryString(params)}`, {
      ...options,
      // The refresh cookie (httpOnly, scoped to /api/v1/auth) travels with every call.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        // FormData sets its own multipart Content-Type (with the boundary).
        ...(body && !isFormData(body) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: !body ? undefined : isFormData(body) ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    // A binary answer (protected evidence images) is returned as a Blob; errors are always JSON.
    const wantsBlob = responseType === 'blob' && response.ok;
    const data =
      response.status === 204
        ? null
        : wantsBlob
          ? await response.blob()
          : await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError('http', data?.error?.message ?? 'Error del servidor.', {
        status: response.status,
        code: data?.error?.code,
      });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw new ApiError('aborted', 'Solicitud cancelada.');
    if (error.name === 'AbortError') throw new ApiError('timeout', 'La solicitud tardó demasiado.');
    throw new ApiError('network', 'No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * `auth: true` sends the in-memory access token and, on a 401, renews the session ONCE
 * (concurrent calls share the same refresh) and retries the request a single time.
 * `auth: 'optional'` is for public reads that personalise their answer: it sends the token when
 * there is one and never triggers a refresh (an expired token just gets the anonymous answer).
 */
export async function apiFetch(path, { auth = false, ...options } = {}) {
  if (!auth) return request(path, options);
  if (auth === 'optional') return request(path, { ...options, token: authHandlers.getAccessToken() });
  try {
    return await request(path, { ...options, token: authHandlers.getAccessToken() });
  } catch (error) {
    const expired = error instanceof ApiError && error.kind === 'http' && error.status === 401;
    if (!expired || !authHandlers.refresh) throw error;
    let token;
    try {
      token = await authHandlers.refresh();
    } catch {
      throw error; // The session could not be renewed: surface the original 401.
    }
    return request(path, { ...options, token });
  }
}
