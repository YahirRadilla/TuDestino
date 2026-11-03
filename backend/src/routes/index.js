import { Router } from 'express';
import { createReadinessHandler, getHealth } from '../controllers/healthController.js';
import { createCatalogControllers } from '../controllers/catalogControllers.js';
import { createEngagementControllers } from '../controllers/engagementControllers.js';
import { createAuthControllers } from '../controllers/authController.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { createAuthenticate, createOptionalAuthenticate } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import { listDestinationsQuery, slugParams } from '../validators/destinations.js';
import { listEduContentsQuery } from '../validators/education.js';
import { publicPinsQuery } from '../validators/map.js';
import { createReportControllers } from '../controllers/reportControllers.js';
import { createReportRouter } from './reportRoutes.js';
import { createStorage, DEFAULT_UPLOADS_DIR } from '../services/storage.js';
import { createAuthRouter, createMeRouter } from './authRoutes.js';
import { createEngagementRouter, mountMyEngagement } from './engagementRoutes.js';
import { createAuthService } from '../services/authService.js';
import { createTokenService } from '../services/tokenService.js';
import { createPasswordService } from '../services/passwordService.js';
import { createAudit } from '../services/audit.js';
import { createAdminAudit } from '../services/adminAudit.js';
import { createAdminControllers } from '../controllers/adminControllers.js';
import { createPushControllers } from '../controllers/pushControllers.js';
import { createPushRouter, mountMyNotifications } from './pushRoutes.js';
import { createNotifier, noopNotifier } from '../services/notify.js';
import { createAdminUserService } from '../services/adminUserService.js';
import { createAdminRouter, createEventProposalRouter, mountMyProposals } from './adminRoutes.js';
import { createUploadControllers } from '../controllers/uploadControllers.js';
import { createUploadRouter } from './uploadRoutes.js';

const DEFAULT_AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, limit: 10 };

// `auth` enables the identity endpoints (/auth/*, /me); catalog-only setups can omit it.
// `reports` tunes citizen reports: { storage, sanitize, rateLimit, trackRateLimit }.
// `admin` tunes the staff panel: { rateLimit, writeRateLimit, proposalRateLimit }.
// `push` enables Web Push: { vapid, allowedHosts, rateLimit, notifier, webPush }.
export function createApiRouter({
  db,
  rateLimitPerMinute = 300,
  auth,
  logger,
  reports = {},
  admin = {},
  push = {},
} = {}) {
  const router = Router();
  router.get('/health', getHealth);
  if (!db) return router;

  router.get('/health/ready', createReadinessHandler(db));

  const controllers = createCatalogControllers(db);
  const engagement = createEngagementControllers(db);
  router.use(createLimiter({ windowMs: 60_000, limit: rateLimitPerMinute }));

  const tokens = auth ? createTokenService({ secret: auth.jwtSecret }) : null;
  const authenticate = tokens ? createAuthenticate(tokens) : null;

  const storage =
    reports.storage ?? createStorage({ driver: 'local', uploadsDir: DEFAULT_UPLOADS_DIR });

  // Web Push is enabled by giving the app VAPID keys. `push.notifier` lets the server share one
  // notifier with the reminder job (and tests inject a scripted one).
  const notifier =
    push.notifier ??
    (push.vapid
      ? createNotifier({ db, logger, vapid: push.vapid, webPush: push.webPush })
      : noopNotifier);
  const pushControllers = push.vapid
    ? createPushControllers(db, { vapidPublicKey: push.vapid.publicKey })
    : null;

  const adminAudit = createAdminAudit(logger);
  let adminControllers = null;
  if (auth) {
    const passwords = createPasswordService({ rounds: auth.bcryptRounds });
    const service = createAuthService({
      db,
      tokens,
      passwords,
      mailer: auth.mailer,
      audit: createAudit(logger, auth.jwtSecret),
      refreshTtlSeconds: auth.refreshTtlSeconds,
    });
    adminControllers = createAdminControllers({
      db,
      storage,
      audit: adminAudit,
      notifier,
      userService: createAdminUserService({
        db,
        passwords,
        mailer: auth.mailer,
        audit: adminAudit,
      }),
    });
    const authControllers = createAuthControllers({
      service,
      logger,
      cookie: {
        secure: auth.cookieSecure,
        domain: auth.cookieDomain,
        maxAgeMs: auth.refreshTtlSeconds * 1000,
      },
    });
    router.use(
      '/auth',
      createAuthRouter({
        controllers: authControllers,
        rateLimit: auth.rateLimit ?? DEFAULT_AUTH_RATE_LIMIT,
      }),
    );
    router.use(
      '/me',
      createMeRouter({
        controllers: authControllers,
        authenticate,
        mount: (me) => {
          mountMyEngagement(me, engagement);
          mountMyProposals(me, adminControllers);
          if (pushControllers) mountMyNotifications(me, pushControllers);
        },
      }),
    );
    router.use(
      '/admin',
      createAdminRouter({
        controllers: adminControllers,
        authenticate,
        db,
        rateLimit: admin.rateLimit,
        writeRateLimit: admin.writeRateLimit,
      }),
    );
    router.use(
      '/uploads',
      createUploadRouter({
        controllers: createUploadControllers({ storage }),
        authenticate,
        rateLimit: admin.uploadRateLimit,
      }),
    );
    router.use(
      createEventProposalRouter({
        controllers: adminControllers,
        authenticate,
        rateLimit: admin.proposalRateLimit,
      }),
    );
  }

  router.use(
    createEngagementRouter({
      controllers: engagement,
      authenticate,
      optionalAuthenticate: tokens && createOptionalAuthenticate(tokens),
    }),
  );

  router.use(
    createReportRouter({
      controllers: createReportControllers(db, {
        storage,
        sanitize: reports.sanitize,
      }),
      optionalAuthenticate: tokens && createOptionalAuthenticate(tokens),
      rateLimit: reports.rateLimit,
      trackRateLimit: reports.trackRateLimit,
      pushControllers,
      pushAllowedHosts: push.allowedHosts,
    }),
  );

  if (pushControllers) {
    router.use(
      createPushRouter({
        controllers: pushControllers,
        optionalAuthenticate: tokens && createOptionalAuthenticate(tokens),
        allowedHosts: push.allowedHosts,
        rateLimit: push.rateLimit,
      }),
    );
  }

  // Shared, anonymous content: safe for browsers, the service worker and CDNs to reuse.
  router.get(
    '/destinations',
    validateQuery(listDestinationsQuery),
    publicCache(),
    controllers.listDestinations,
  );
  router.get(
    '/destinations/:slug',
    validateParams(slugParams),
    publicCache(),
    controllers.getDestination,
  );
  router.get('/destination-categories', publicCache(), controllers.listDestinationCategories);
  router.get(
    '/edu-contents',
    validateQuery(listEduContentsQuery),
    publicCache(),
    controllers.listEduContents,
  );
  router.get('/edu-categories', publicCache(), controllers.listEduCategories);
  // Anonymous map layer: destinations plus resolved, non-sensitive reports with rounded coordinates.
  router.get('/map/pins', validateQuery(publicPinsQuery), publicCache(), controllers.listMapPins);
  return router;
}
