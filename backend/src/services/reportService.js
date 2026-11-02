import { randomUUID } from 'node:crypto';
import * as reports from '../models/reportModel.js';
import * as destinations from '../models/destinationModel.js';
import { HttpError } from '../utils/httpError.js';
import { withTransaction } from '../utils/transaction.js';
import { sanitizeImage } from './imageService.js';
import { generateTrackingCode, hashesMatch, hashTrackingCode } from './trackingCode.js';

export const INITIAL_NOTE = 'Reporte recibido';
const EVIDENCE_FOLDER = 'reports';

// Compared against when the folio does not exist, so both failures cost the same.
const DECOY_HASH = hashTrackingCode(randomUUID());

const trackNotFound = () =>
  new HttpError(
    404,
    'REPORT_NOT_FOUND',
    'No encontramos un reporte con ese folio y código. Revisa los datos.',
  );

export const listReportTypes = (db) => reports.findPublicTypes(db);

const replayOf = (row) => ({
  replayed: true,
  data: {
    folio: row.folio,
    status: row.status,
    created_at: row.created_at,
    tracking_code: null,
    replayed: true,
  },
});

// Creates a report with its evidence and first history row in ONE transaction. Idempotent on
// `client_uuid`: a retry (or a concurrent twin) gets the same folio back and never a second code.
export async function createReport(
  db,
  { storage, sanitize = sanitizeImage },
  { input, photos = [], userId = null },
) {
  const typeId = await reports.findTypeIdBySlug(db, input.type);
  if (!typeId) throw new HttpError(400, 'VALIDATION_ERROR', 'type: tipo de reporte desconocido');

  const existing = await reports.findByClientUuid(db, input.client_uuid);
  if (existing) return replayOf(existing);

  let destinationId = null;
  if (input.destination_slug) {
    destinationId = await destinations.findPublishedId(db, input.destination_slug);
    if (!destinationId) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'destination_slug: destino desconocido');
    }
  }

  // Validates magic bytes and strips metadata BEFORE touching the database or the storage.
  const images = await Promise.all(photos.map((photo) => sanitize(photo.buffer)));

  const trackingCode = generateTrackingCode();
  const stored = [];
  let outcome;
  try {
    outcome = await withTransaction(db, async (client) => {
      const row = await reports.insertIfAbsent(client, {
        clientUuid: input.client_uuid,
        typeId,
        description: input.description,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracy_m,
        destinationId,
        occurredAt: input.occurred_at,
        // An anonymous report never carries the session, even when a valid token was sent.
        reporterId: input.anonymous ? null : userId,
        trackingCodeHash: hashTrackingCode(trackingCode),
      });
      if (!row) return null;
      for (const image of images) {
        const saved = await storage.save(image.data, {
          folder: EVIDENCE_FOLDER,
          name: `${row.id}-${randomUUID()}.webp`,
          mimeType: image.mimeType,
        });
        stored.push(saved);
        await reports.insertEvidence(client, {
          reportId: row.id,
          url: saved.url,
          publicId: saved.publicId,
          mimeType: image.mimeType,
        });
      }
      await reports.insertStatusHistory(client, {
        reportId: row.id,
        fromStatus: null,
        toStatus: 'pending',
        note: INITIAL_NOTE,
      });
      return row;
    });
  } catch (error) {
    // The transaction rolled back: do not leave files that no row points to.
    await Promise.allSettled(stored.map((file) => storage.remove(file.publicId)));
    throw error;
  }

  if (!outcome) {
    // A concurrent request with the same uuid won the race and has already committed.
    const winner = await reports.findByClientUuid(db, input.client_uuid);
    if (!winner)
      throw new HttpError(409, 'REPORT_CONFLICT', 'Reintenta el envío en unos segundos.');
    return replayOf(winner);
  }
  return {
    replayed: false,
    data: {
      folio: outcome.folio,
      status: outcome.status,
      created_at: outcome.created_at,
      tracking_code: trackingCode,
      replayed: false,
      evidences_count: images.length,
    },
  };
}

// Proof of possession of a report: the folio plus its tracking code. The hash comparison is
// constant time and an unknown folio costs the same as a wrong code, so both give the same 404.
export async function authenticateReport(db, { folio, code }) {
  const row = await reports.findForTracking(db, folio);
  const matches = hashesMatch(row?.tracking_code_hash ?? DECOY_HASH, hashTrackingCode(code));
  if (!row || !matches) throw trackNotFound();
  return row;
}

// Same 404 for an unknown folio and for a wrong code. The response never includes the author,
// the evidence or who changed a status.
export async function trackReport(db, { folio, code }) {
  const row = await authenticateReport(db, { folio, code });
  const history = await reports.findHistory(db, row.id);
  return {
    data: {
      folio: row.folio,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      history,
    },
  };
}
