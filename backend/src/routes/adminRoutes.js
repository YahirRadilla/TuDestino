import { Router } from 'express';
import { z } from 'zod';
import { requireCurrentRole, requireRole } from '../middleware/auth.js';
import { noStore } from '../middleware/cache.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { paginationShape } from '../validators/common.js';
import { adminPinsQuery } from '../validators/map.js';
import {
  changeReportStatusBody,
  createAdminUserBody,
  createDestinationBody,
  createEduBody,
  createEventBody,
  evidenceParams,
  idParams,
  listAdminDestinationsQuery,
  listAdminEduQuery,
  listAdminEventsQuery,
  listAdminReportsQuery,
  listAdminUsersQuery,
  moderateEventBody,
  updateAdminUserBody,
  updateDestinationBody,
  updateEduBody,
  updateEventBody,
} from '../validators/admin.js';

export const DEFAULT_ADMIN_RATE_LIMIT = { windowMs: 60_000, limit: 240 };
export const DEFAULT_ADMIN_WRITE_RATE_LIMIT = { windowMs: 60_000, limit: 60 };
export const DEFAULT_PROPOSAL_RATE_LIMIT = { windowMs: 60 * 60_000, limit: 10 };

const pageQuery = z.object({ ...paginationShape });

const STAFF = ['authority', 'admin'];

// Everything under /admin: authenticated, role checked twice (token claim, then the live account),
// never cacheable. Authorities manage all reports and content (the data model has no area on
// them, see README); user and area management is admin only.
export function createAdminRouter({
  controllers,
  authenticate,
  db,
  rateLimit = DEFAULT_ADMIN_RATE_LIMIT,
  writeRateLimit = DEFAULT_ADMIN_WRITE_RATE_LIMIT,
}) {
  const router = Router();
  const writeLimiter = createLimiter(writeRateLimit);
  router.use(createLimiter(rateLimit), authenticate);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    return req.method === 'GET' ? next() : writeLimiter(req, res, next);
  });

  const staff = [requireRole(...STAFF), requireCurrentRole(db, ...STAFF)];
  const adminOnly = [requireRole('admin'), requireCurrentRole(db, 'admin')];

  router.get('/summary', ...staff, controllers.summary);

  router.get('/reports', ...staff, validateQuery(listAdminReportsQuery), controllers.listReports);
  router.get('/reports/:id', ...staff, validateParams(idParams), controllers.getReport);
  router.get(
    '/reports/:id/evidences/:evidenceId',
    ...staff,
    validateParams(evidenceParams),
    controllers.downloadEvidence,
  );
  router.patch(
    '/reports/:id/status',
    ...staff,
    validateParams(idParams),
    validateBody(changeReportStatusBody),
    controllers.changeReportStatus,
  );

  router.get('/map/pins', ...staff, validateQuery(adminPinsQuery), controllers.listMapPins);

  router.get(
    '/destinations',
    ...staff,
    validateQuery(listAdminDestinationsQuery),
    controllers.listDestinations,
  );
  router.get('/destinations/:id', ...staff, validateParams(idParams), controllers.getDestination);
  router.post(
    '/destinations',
    ...staff,
    validateBody(createDestinationBody),
    controllers.createDestination,
  );
  router.patch(
    '/destinations/:id',
    ...staff,
    validateParams(idParams),
    validateBody(updateDestinationBody),
    controllers.updateDestination,
  );
  router.delete(
    '/destinations/:id',
    ...staff,
    validateParams(idParams),
    controllers.deleteDestination,
  );

  router.get('/events', ...staff, validateQuery(listAdminEventsQuery), controllers.listEvents);
  router.get('/events/:id', ...staff, validateParams(idParams), controllers.getEvent);
  router.post('/events', ...staff, validateBody(createEventBody), controllers.createEvent);
  router.patch(
    '/events/:id',
    ...staff,
    validateParams(idParams),
    validateBody(updateEventBody),
    controllers.updateEvent,
  );
  router.delete('/events/:id', ...staff, validateParams(idParams), controllers.deleteEvent);
  router.patch(
    '/events/:id/moderation',
    ...staff,
    validateParams(idParams),
    validateBody(moderateEventBody),
    controllers.moderateEvent,
  );

  router.get('/edu-contents', ...staff, validateQuery(listAdminEduQuery), controllers.listContents);
  router.get('/edu-contents/:id', ...staff, validateParams(idParams), controllers.getContent);
  router.post('/edu-contents', ...staff, validateBody(createEduBody), controllers.createContent);
  router.patch(
    '/edu-contents/:id',
    ...staff,
    validateParams(idParams),
    validateBody(updateEduBody),
    controllers.updateContent,
  );
  router.delete('/edu-contents/:id', ...staff, validateParams(idParams), controllers.deleteContent);

  router.get('/users', ...adminOnly, validateQuery(listAdminUsersQuery), controllers.listUsers);
  router.post('/users', ...adminOnly, validateBody(createAdminUserBody), controllers.createUser);
  router.patch(
    '/users/:id',
    ...adminOnly,
    validateParams(idParams),
    validateBody(updateAdminUserBody),
    controllers.updateUser,
  );
  router.post(
    '/users/:id/invitation',
    ...adminOnly,
    validateParams(idParams),
    controllers.resendInvitation,
  );
  router.get('/areas', ...adminOnly, controllers.listAreas);
  return router;
}

// POST /events: any signed-in user proposes an event; it stays `pending` until staff moderate it.
export function createEventProposalRouter({
  controllers,
  authenticate,
  rateLimit = DEFAULT_PROPOSAL_RATE_LIMIT,
}) {
  const router = Router();
  router.post(
    '/events',
    authenticate,
    createLimiter(rateLimit),
    validateBody(createEventBody),
    noStore,
    controllers.proposeEvent,
  );
  return router;
}

// Mounted under /me, after `authenticate`.
export function mountMyProposals(router, controllers) {
  router.get('/events/proposed', validateQuery(pageQuery), controllers.listMyProposals);
  return router;
}
