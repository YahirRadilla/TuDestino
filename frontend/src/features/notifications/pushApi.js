import { apiFetch } from '../../api/client.js';
import { normalizeCode, normalizeFolio } from '../reports/reportValidation.js';

// Also imported by the service worker (pushsubscriptionchange): no DOM access at import time.

export async function fetchPublicKey(signal) {
  const payload = await apiFetch('/push/public-key', { signal });
  return payload.data.public_key;
}

/** Registers (or refreshes) this device. A signed-in session links it to the account. */
export async function saveSubscription(subscription, { auth = 'optional' } = {}) {
  await apiFetch('/push/subscriptions', { method: 'POST', body: subscription.toJSON(), auth });
}

/** Proof of possession: the server only deletes when the subscription's own `auth` secret matches. */
export async function deleteSubscription(subscription) {
  const { endpoint, keys } = subscription.toJSON();
  await apiFetch('/push/subscriptions', { method: 'DELETE', body: { endpoint, auth: keys?.auth } });
}

// Folio + code prove the person made the report; the server ties it to the DEVICE, not to a person.
const followBody = ({ folio, trackingCode, endpoint }) => ({
  folio: normalizeFolio(folio),
  tracking_code: normalizeCode(trackingCode),
  endpoint,
});

export async function followReport(input, signal) {
  await apiFetch('/reports/follow', { method: 'POST', body: followBody(input), signal });
}

export async function unfollowReport(input, signal) {
  await apiFetch('/reports/follow', { method: 'DELETE', body: followBody(input), signal });
}
