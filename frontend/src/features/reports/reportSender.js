import { apiFetch } from '../../api/client.js';
import { classifyError } from '../../api/classifyError.js';

export { classifyError };

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
