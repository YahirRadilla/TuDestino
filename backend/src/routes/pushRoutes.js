import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { noStore, publicCache } from '../middleware/cache.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createSubscribeBody,
  listNotificationsQuery,
  notificationIdParams,
  unsubscribeBody,
} from '../validators/push.js';

export const DEFAULT_PUSH_RATE_LIMIT = { windowMs: 60 * 60_000, limit: 30 };

// Public: a device can subscribe without an account (anonymous report follow-ups). A valid session,
// when sent, only links the device to that account.
export function createPushRouter({
  controllers,
  optionalAuthenticate,
  allowedHosts = null,
  rateLimit = DEFAULT_PUSH_RATE_LIMIT,
}) {
  const router = Router();
  const optional = optionalAuthenticate ?? ((_req, _res, next) => next());
  const limiter = createLimiter(rateLimit);

  router.get('/push/public-key', publicCache(), controllers.publicKey);
  router.post(
    '/push/subscriptions',
    limiter,
    noStore,
    optional,
    validateBody(createSubscribeBody(allowedHosts)),
    controllers.subscribe,
  );
  router.delete(
    '/push/subscriptions',
    limiter,
    noStore,
    validateBody(unsubscribeBody),
    controllers.unsubscribe,
  );
  return router;
}

// Mounted under /me, after `authenticate`. Per-user data: never cacheable (`noStore` is set there).
export function mountMyNotifications(router, controllers) {
  router.use('/notifications', noStore);
  router.get(
    '/notifications',
    validateQuery(listNotificationsQuery),
    controllers.listNotifications,
  );
  router.post('/notifications/read-all', controllers.markAllNotificationsRead);
  router.patch(
    '/notifications/:id/read',
    validateParams(notificationIdParams),
    controllers.markNotificationRead,
  );
  return router;
}
