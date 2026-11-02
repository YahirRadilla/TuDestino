import { ApiError, apiFetch } from '../../api/client.js';

// Sending a queued report. Shared by the page and the service worker (src/sw.js), so this module
// must stay free of React and of the DOM.

export const UPLOAD_TIMEOUT_MS = 30_000;
// A report that has waited longer than this reports its real time, not the time it got through.
const DELAYED_AFTER_MS = 2 * 60_000;

export function occurredAtFor(entry, now = Date.now()) {
  if (now - entry.createdAt < DELAYED_AFTER_MS) return undefined;
  // Never in the future: the API refuses it and a skewed clock would block the report.
  return new Date(Math.min(entry.createdAt, now - 1000)).toISOString();
}

export function buildReportFormData(entry, now = Date.now()) {
  const { payload } = entry;
  const form = new FormData();
  form.set('client_uuid', entry.clientUuid);
  form.set('type', payload.type);
  form.set('description', payload.description);
  form.set('lat', String(payload.lat));
  form.set('lng', String(payload.lng));
  form.set('anonymous', payload.anonymous ? 'true' : 'false');
  if (payload.accuracy_m != null) form.set('accuracy_m', String(payload.accuracy_m));
  if (payload.destination_slug) form.set('destination_slug', payload.destination_slug);
  const occurredAt = occurredAtFor(entry, now);
  if (occurredAt) form.set('occurred_at', occurredAt);
  entry.photos.forEach((photo, index) => {
    const blob = new Blob([photo.data], { type: photo.type });
    form.append('photos', blob, photo.name || `foto-${index + 1}.jpg`);
  });
  return form;
}

const RETRYABLE_STATUS = (status) => status === 408 || status === 409 || status === 429 || status >= 500;

/**
 * 'sent'   -> delivered (a 200 replay of an earlier delivery counts as delivered).
 * 'retry'  -> transient: no network, timeout, 5xx, 429, 408 or a 409 race. Keep it queued.
 * 'failed' -> the server refused this report (validation, size, type): retrying cannot help.
 */
export function classifyError(error) {
  if (!(error instanceof ApiError)) return { outcome: 'retry', reason: 'Error inesperado.', kind: 'unknown' };
  if (error.kind !== 'http') return { outcome: 'retry', reason: error.message, kind: error.kind };
  if (RETRYABLE_STATUS(error.status)) {
    return { outcome: 'retry', reason: error.message, kind: 'http' };
  }
  return { outcome: 'failed', reason: error.message, code: error.code };
}

export function toReceipt(response, now = Date.now()) {
  const data = response?.data ?? {};
  return {
    folio: data.folio ?? null,
    trackingCode: data.tracking_code ?? null,
    replayed: Boolean(data.replayed),
    sentAt: now,
  };
}

/** Never throws: the outcome tells the caller what to do with the outbox entry. */
export async function sendReport(entry, { fetcher = apiFetch, now = Date.now } = {}) {
  try {
    const response = await fetcher('/reports', {
      method: 'POST',
      body: buildReportFormData(entry, now()),
      timeoutMs: UPLOAD_TIMEOUT_MS,
      // An anonymous report never carries the session, even from the page.
      auth: entry.payload.anonymous ? false : 'optional',
    });
    if (!response?.data?.folio) {
      return { outcome: 'retry', reason: 'Respuesta inesperada del servidor.', kind: 'http' };
    }
    return { outcome: 'sent', receipt: toReceipt(response, now()) };
  } catch (error) {
    return classifyError(error);
  }
}
