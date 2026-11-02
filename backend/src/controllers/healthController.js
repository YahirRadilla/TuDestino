import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export function getHealth(_req, res) {
  res.status(200).json({ status: 'ok' });
}

export const createReadinessHandler = (db) =>
  asyncHandler(async (_req, res) => {
    try {
      await db.query('SELECT 1');
    } catch {
      throw new HttpError(503, 'DB_UNAVAILABLE', 'La base de datos no responde.');
    }
    res.status(200).json({ status: 'ok', db: 'up' });
  });
