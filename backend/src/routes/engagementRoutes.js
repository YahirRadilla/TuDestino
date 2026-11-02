import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  cacheUnlessAuthenticated,
  noStore,
  publicCache,
  SHORT_PUBLIC_CACHE,
} from '../middleware/cache.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { slugParams } from '../validators/destinations.js';
import { eventIdParams, listEventsQuery } from '../validators/events.js';
import { listMyEventsQuery, listMyFavoritesQuery, listMyReviewsQuery } from '../validators/me.js';
import { listReviewsQuery, reviewBody } from '../validators/reviews.js';

const WRITE_RATE_LIMIT = { windowMs: 60_000, limit: 30 };

const passThrough = (_req, _res, next) => next();

// Public reads (reviews, events) plus the writes of signed-in users.
// `authenticate` / `optionalAuthenticate` are absent in catalog-only setups: the public reads
// keep working and the user-bound routes are not mounted.
export function createEngagementRouter({ controllers, authenticate, optionalAuthenticate }) {
  const router = Router();
  const optional = optionalAuthenticate ?? passThrough;

  router.get(
    '/destinations/:slug/reviews',
    validateParams(slugParams),
    validateQuery(listReviewsQuery),
    publicCache(SHORT_PUBLIC_CACHE),
    controllers.listReviews,
  );
  router.get(
    '/events',
    optional,
    validateQuery(listEventsQuery),
    cacheUnlessAuthenticated(),
    controllers.listEvents,
  );
  router.get(
    '/events/:id',
    optional,
    validateParams(eventIdParams),
    cacheUnlessAuthenticated(),
    controllers.getEvent,
  );

  if (!authenticate) return router;

  const writeLimiter = createLimiter(WRITE_RATE_LIMIT);
  router.post(
    '/destinations/:slug/reviews',
    authenticate,
    writeLimiter,
    validateParams(slugParams),
    validateBody(reviewBody),
    noStore,
    controllers.createReview,
  );
  router.put(
    '/destinations/:slug/reviews/me',
    authenticate,
    writeLimiter,
    validateParams(slugParams),
    validateBody(reviewBody),
    noStore,
    controllers.saveMyReview,
  );
  router.put(
    '/events/:id/attendance',
    authenticate,
    writeLimiter,
    validateParams(eventIdParams),
    noStore,
    controllers.attend,
  );
  router.delete(
    '/events/:id/attendance',
    authenticate,
    writeLimiter,
    validateParams(eventIdParams),
    noStore,
    controllers.unattend,
  );
  return router;
}

// Mounted under /me, after `authenticate`. Everything here is per-user: never cacheable.
export function mountMyEngagement(router, controllers) {
  router.use(noStore);
  router.get('/favorites', validateQuery(listMyFavoritesQuery), controllers.listMyFavorites);
  router.put('/favorites/:slug', validateParams(slugParams), controllers.addFavorite);
  router.delete('/favorites/:slug', validateParams(slugParams), controllers.removeFavorite);
  router.get('/reviews', validateQuery(listMyReviewsQuery), controllers.listMyReviews);
  router.get('/events', validateQuery(listMyEventsQuery), controllers.listMyEvents);
  return router;
}
