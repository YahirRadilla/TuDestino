import { timingSafeEqual } from 'node:crypto';
import * as push from '../models/pushModel.js';
import { HttpError } from '../utils/httpError.js';
import { authenticateReport } from './reportService.js';

const subscriptionNotFound = () =>
  new HttpError(404, 'SUBSCRIPTION_NOT_FOUND', 'No encontramos esa suscripción.');

const sameSecret = (expected, candidate) => {
  const a = Buffer.from(String(expected ?? ''));
  const b = Buffer.from(String(candidate ?? ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
};

// Idempotent on the endpoint. The session (if any) decides which account the device belongs to.
export async function subscribe(db, { userId, input }) {
  const { created } = await push.upsertSubscription(db, {
    userId: userId ?? null,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  });
  return { created };
}

// Unknown endpoint and wrong `auth` secret look the same, so the endpoint cannot be probed.
export async function unsubscribe(db, { endpoint, auth }) {
  const subscription = await push.findByEndpoint(db, endpoint);
  if (!subscription || !sameSecret(subscription.auth, auth)) throw subscriptionNotFound();
  await push.deleteById(db, subscription.id);
}

// Ties a report to a DEVICE after proving possession of its folio + tracking code. No account, IP
// or user agent is involved, so an anonymous reporter stays anonymous (ADR-03).
async function resolveFollow(db, { folio, trackingCode, endpoint }) {
  const report = await authenticateReport(db, { folio, code: trackingCode });
  const subscription = await push.findByEndpoint(db, endpoint);
  if (!subscription) {
    throw new HttpError(
      404,
      'SUBSCRIPTION_NOT_FOUND',
      'Activa los avisos en este dispositivo antes de seguir el reporte.',
    );
  }
  return { reportId: report.id, subscriptionId: subscription.id };
}

export async function followReport(db, input) {
  await push.addFollower(db, await resolveFollow(db, input));
}

export async function unfollowReport(db, input) {
  await push.removeFollower(db, await resolveFollow(db, input));
}
