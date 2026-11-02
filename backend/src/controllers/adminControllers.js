import { pipeline } from 'node:stream/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import * as reportService from '../services/adminReportService.js';
import * as destinationService from '../services/adminDestinationService.js';
import * as eventService from '../services/adminEventService.js';
import * as eduService from '../services/adminEduService.js';
import * as mapService from '../services/mapService.js';
import { noopNotifier } from '../services/notify.js';

const IMAGE_MIME = new Set(['image/webp', 'image/jpeg', 'image/png']);

// Thin HTTP adapters for the staff panel. `req.user` is already the CURRENT account (role/area
// re-read by `requireCurrentRole`); every mutation leaves an entry in the audit log.
export function createAdminControllers({
  db,
  storage,
  userService,
  audit,
  notifier = noopNotifier,
}) {
  const actorOf = (req) => ({ id: req.user.id, role: req.user.role });

  return {
    summary: asyncHandler(async (_req, res) => {
      const [reports, pendingEvents] = await Promise.all([
        reportService.getSummary(db),
        eventService.countPendingEvents(db),
      ]);
      res.json({ data: { reports, pending_events: pendingEvents } });
    }),

    // ----- reports -----
    listReports: asyncHandler(async (_req, res) => {
      res.json(await reportService.listReports(db, res.locals.query));
    }),
    getReport: asyncHandler(async (req, res) => {
      res.json(await reportService.getReport(db, res.locals.params.id, req.user.role));
    }),
    changeReportStatus: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      const { outcome, data } = await reportService.changeStatus(
        db,
        id,
        res.locals.body,
        actorOf(req),
      );
      // The note is free text written by staff: it stays in the database, never in the log.
      audit.record('report.status_changed', actorOf(req), {
        reportId: id,
        folio: outcome.folio,
        from: outcome.from,
        to: res.locals.body.status,
      });
      // The transaction is committed: tell followers in the background, never delaying the reply.
      notifier.reportStatusChanged({ reportId: id });
      res.json({ data });
    }),
    downloadEvidence: asyncHandler(async (req, res) => {
      const { id, evidenceId } = res.locals.params;
      const evidence = await reportService.findEvidenceFile(db, { reportId: id, evidenceId });
      const file = await storage.read(evidence.public_id);
      if (!file) throw new HttpError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada.');
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': IMAGE_MIME.has(evidence.mime_type)
          ? evidence.mime_type
          : 'application/octet-stream',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        ...(file.size ? { 'Content-Length': String(file.size) } : {}),
      });
      try {
        await pipeline(file.stream, res);
      } catch (error) {
        if (!res.headersSent) throw error;
        res.destroy(error);
      }
    }),

    // ----- map -----
    // Exact coordinates: the audit entry records only counts and the (enum) filters.
    listMapPins: asyncHandler(async (req, res) => {
      const result = await mapService.getAdminPins(db, res.locals.query);
      audit.record('map.pins_viewed', actorOf(req), {
        count: result.data.reports.length,
        status: res.locals.query.status,
        type: res.locals.query.type,
        bounded: Boolean(res.locals.query.bbox),
      });
      res.json(result);
    }),

    // ----- destinations -----
    listDestinations: asyncHandler(async (_req, res) => {
      res.json(await destinationService.listDestinations(db, res.locals.query));
    }),
    getDestination: asyncHandler(async (_req, res) => {
      res.json(await destinationService.getDestination(db, res.locals.params.id));
    }),
    createDestination: asyncHandler(async (req, res) => {
      const { id, data } = await destinationService.createDestination(
        db,
        res.locals.body,
        actorOf(req),
      );
      audit.record('destination.created', actorOf(req), { destinationId: id });
      res.status(201).json({ data });
    }),
    updateDestination: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      const result = await destinationService.updateDestination(db, id, res.locals.body);
      audit.record('destination.updated', actorOf(req), { destinationId: id });
      res.json(result);
    }),
    deleteDestination: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      await destinationService.deleteDestination(db, id);
      audit.record('destination.deleted', actorOf(req), { destinationId: id });
      res.status(204).end();
    }),

    // ----- events -----
    listEvents: asyncHandler(async (_req, res) => {
      res.json(await eventService.listEvents(db, res.locals.query));
    }),
    getEvent: asyncHandler(async (_req, res) => {
      res.json(await eventService.getEvent(db, res.locals.params.id));
    }),
    createEvent: asyncHandler(async (req, res) => {
      const { id, data } = await eventService.createEvent(db, res.locals.body, actorOf(req));
      audit.record('event.created', actorOf(req), { eventId: id });
      res.status(201).json({ data });
    }),
    updateEvent: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      const result = await eventService.updateEvent(db, id, res.locals.body);
      audit.record('event.updated', actorOf(req), { eventId: id });
      res.json(result);
    }),
    deleteEvent: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      await eventService.deleteEvent(db, id);
      audit.record('event.deleted', actorOf(req), { eventId: id });
      res.status(204).end();
    }),
    moderateEvent: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      const result = await eventService.moderateEvent(db, id, res.locals.body, actorOf(req));
      audit.record('event.moderated', actorOf(req), {
        eventId: id,
        action: res.locals.body.action,
      });
      notifier.eventModerated({
        eventId: id,
        action: res.locals.body.action,
        actorId: req.user.id,
      });
      res.json(result);
    }),

    // ----- education -----
    listContents: asyncHandler(async (_req, res) => {
      res.json(await eduService.listContents(db, res.locals.query));
    }),
    getContent: asyncHandler(async (_req, res) => {
      res.json(await eduService.getContent(db, res.locals.params.id));
    }),
    createContent: asyncHandler(async (req, res) => {
      const { id, data } = await eduService.createContent(db, res.locals.body, actorOf(req));
      audit.record('edu.created', actorOf(req), { contentId: id });
      res.status(201).json({ data });
    }),
    updateContent: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      const result = await eduService.updateContent(db, id, res.locals.body);
      audit.record('edu.updated', actorOf(req), { contentId: id });
      res.json(result);
    }),
    deleteContent: asyncHandler(async (req, res) => {
      const { id } = res.locals.params;
      await eduService.deleteContent(db, id);
      audit.record('edu.deleted', actorOf(req), { contentId: id });
      res.status(204).end();
    }),

    // ----- users (admin only) -----
    listUsers: asyncHandler(async (_req, res) => {
      res.json(await userService.listUsers(res.locals.query));
    }),
    listAreas: asyncHandler(async (_req, res) => {
      res.json(await userService.listAreas());
    }),
    createUser: asyncHandler(async (req, res) => {
      res.status(201).json(await userService.createUser(res.locals.body, actorOf(req)));
    }),
    updateUser: asyncHandler(async (req, res) => {
      res.json(await userService.updateUser(res.locals.params.id, res.locals.body, actorOf(req)));
    }),
    resendInvitation: asyncHandler(async (req, res) => {
      res.json(await userService.resendInvitation(res.locals.params.id, actorOf(req)));
    }),

    // ----- proposals (any signed-in user) -----
    proposeEvent: asyncHandler(async (req, res) => {
      const { id, data } = await eventService.proposeEvent(db, res.locals.body, req.user);
      audit.record('event.proposed', { id: req.user.id, role: req.user.role }, { eventId: id });
      res.status(201).json({ data });
    }),
    listMyProposals: asyncHandler(async (req, res) => {
      res.json(await eventService.listMyProposals(db, req.user.id, res.locals.query));
    }),
  };
}
