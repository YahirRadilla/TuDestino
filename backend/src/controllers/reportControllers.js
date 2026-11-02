import { asyncHandler } from '../utils/asyncHandler.js';
import * as reportService from '../services/reportService.js';

// Reports are public: `req.user` exists only when a valid session was sent, and the service decides
// whether to use it (never for anonymous reports).
export function createReportControllers(db, { storage, sanitize }) {
  return {
    listTypes: asyncHandler(async (_req, res) => {
      res.json({ data: await reportService.listReportTypes(db) });
    }),
    create: asyncHandler(async (req, res) => {
      const { replayed, data } = await reportService.createReport(
        db,
        { storage, sanitize },
        { input: res.locals.body, photos: req.files ?? [], userId: req.user?.id ?? null },
      );
      res.status(replayed ? 200 : 201).json({ data });
    }),
    track: asyncHandler(async (_req, res) => {
      res.json(await reportService.trackReport(db, res.locals.body));
    }),
  };
}
