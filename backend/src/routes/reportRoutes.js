import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { noStore, publicCache } from '../middleware/cache.js';
import { validateBody } from '../middleware/validate.js';
import { createReportUpload } from '../middleware/upload.js';
import { createReportBody, trackReportBody } from '../validators/reports.js';
import { createFollowBody } from '../validators/push.js';

export const DEFAULT_REPORT_RATE_LIMIT = { windowMs: 60 * 60_000, limit: 10 };
export const DEFAULT_TRACK_RATE_LIMIT = { windowMs: 15 * 60_000, limit: 10 };

// Citizen reports: every route here is public (visitors can report and track).
// `optionalAuthenticate` only links a signed-in, non-anonymous reporter.
export function createReportRouter({
  controllers,
  optionalAuthenticate,
  rateLimit = DEFAULT_REPORT_RATE_LIMIT,
  trackRateLimit = DEFAULT_TRACK_RATE_LIMIT,
  pushControllers,
  pushAllowedHosts = null,
}) {
  const router = Router();
  // Tracking and following both prove possession of a folio + code: one shared budget, so the
  // second route cannot double the number of guesses an attacker gets.
  const trackLimiter = createLimiter(trackRateLimit);
  const optional = optionalAuthenticate ?? ((_req, _res, next) => next());

  router.get('/report-types', publicCache(), controllers.listTypes);

  // The limiter runs before the upload is read so abusive clients are cut off early.
  router.post(
    '/reports',
    createLimiter(rateLimit),
    noStore,
    createReportUpload(),
    optional,
    validateBody(createReportBody),
    controllers.create,
  );
  router.post(
    '/reports/track',
    trackLimiter,
    noStore,
    validateBody(trackReportBody),
    controllers.track,
  );
  if (pushControllers) {
    const followBody = createFollowBody(pushAllowedHosts);
    router.post(
      '/reports/follow',
      trackLimiter,
      noStore,
      validateBody(followBody),
      pushControllers.follow,
    );
    router.delete(
      '/reports/follow',
      trackLimiter,
      noStore,
      validateBody(followBody),
      pushControllers.unfollow,
    );
  }
  return router;
}
