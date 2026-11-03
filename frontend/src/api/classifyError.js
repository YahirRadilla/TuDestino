import { ApiError } from './client.js';

// How a failed request should be treated by an offline queue. Shared by reports and event
// proposals so a dead connection always means "keep it queued", not "the server rejected it".

const RETRYABLE_STATUS = (status) => status === 408 || status === 409 || status === 429 || status >= 500;

/**
 * 'sent'   -> delivered (a 200 replay of an earlier delivery counts as delivered).
 * 'retry'  -> transient: no network, timeout, 5xx, 429, 408 or a 409 race. Keep it queued.
 * 'failed' -> the server refused this item (validation, size, type): retrying cannot help.
 */
export function classifyError(error) {
  if (!(error instanceof ApiError)) return { outcome: 'retry', reason: 'Error inesperado.', kind: 'unknown' };
  if (error.kind !== 'http') return { outcome: 'retry', reason: error.message, kind: error.kind };
  if (RETRYABLE_STATUS(error.status)) {
    return { outcome: 'retry', reason: error.message, kind: 'http' };
  }
  return { outcome: 'failed', reason: error.message, code: error.code };
}
