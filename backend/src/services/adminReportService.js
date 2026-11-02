import * as reports from '../models/adminReportModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';
import { allowedTransitions, canTransition } from './reportTransitions.js';

const notFound = () => new HttpError(404, 'REPORT_NOT_FOUND', 'Reporte no encontrado.');

const toListItem = (row) => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  type: { slug: row.type_slug, name: row.type_name },
  excerpt: row.excerpt,
  anonymous: row.anonymous,
  evidences_count: row.evidences_count,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Whitelist: an anonymous report has no `reporter` key content at all (only `anonymous: true`).
const toDetail = ({ row, evidences, history, role }) => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  description: row.description,
  occurred_at: row.occurred_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
  type: { slug: row.type_slug, name: row.type_name, is_sensitive: row.is_sensitive },
  location: { lat: row.lat, lng: row.lng, accuracy_m: row.accuracy_m },
  destination: row.destination_slug
    ? { slug: row.destination_slug, name: row.destination_name }
    : null,
  anonymous: row.reporter_id == null,
  reporter:
    row.reporter_id == null
      ? null
      : { id: row.reporter_id, full_name: row.reporter_name, email: row.reporter_email },
  evidences: evidences.map((evidence) => ({
    id: evidence.id,
    mime_type: evidence.mime_type,
    created_at: evidence.created_at,
    // Relative to the API base; only authenticated staff can follow it.
    download_path: `/admin/reports/${row.id}/evidences/${evidence.id}`,
  })),
  history: history.map((item) => ({
    id: item.id,
    from_status: item.from_status,
    to_status: item.to_status,
    note: item.note,
    created_at: item.created_at,
    changed_by: item.changed_by_name ? { full_name: item.changed_by_name } : null,
  })),
  allowed_transitions: allowedTransitions(row.status, role),
});

export async function listReports(db, query) {
  const { page, limit, ...filters } = query;
  const [rows, total] = await Promise.all([
    reports.findPage(db, { ...filters, limit, offset: offsetOf({ page, limit }) }),
    reports.count(db, filters),
  ]);
  return { data: rows.map(toListItem), meta: buildMeta({ page, limit }, total) };
}

async function loadDetail(db, id, role) {
  const row = await reports.findDetail(db, id);
  if (!row) throw notFound();
  const [evidences, history] = await Promise.all([
    reports.findEvidences(db, id),
    reports.findHistory(db, id),
  ]);
  return toDetail({ row, evidences, history, role });
}

export async function getReport(db, id, role) {
  return { data: await loadDetail(db, id, role) };
}

// UPDATE + history INSERT in ONE transaction under a row lock. The original content of the report
// and the history are never edited: there is no code path that updates them.
export async function changeStatus(db, id, { status, note }, actor) {
  const outcome = await withTransaction(db, async (client) => {
    const current = await reports.lockForUpdate(client, id);
    if (!current) throw notFound();
    if (!canTransition(current.status, status, actor.role)) {
      throw new HttpError(
        409,
        'INVALID_TRANSITION',
        `No se puede pasar un reporte de "${current.status}" a "${status}".`,
      );
    }
    await reports.updateStatus(client, id, status);
    await reports.insertHistory(client, {
      reportId: id,
      fromStatus: current.status,
      toStatus: status,
      note,
      changedBy: actor.id,
    });
    return { folio: current.folio, from: current.status };
  });
  return { outcome, data: await loadDetail(db, id, actor.role) };
}

export async function findEvidenceFile(db, { reportId, evidenceId }) {
  const evidence = await reports.findEvidence(db, reportId, evidenceId);
  if (!evidence?.public_id) {
    throw new HttpError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada.');
  }
  return evidence;
}

export async function getSummary(db) {
  const counts = Object.fromEntries(
    (await reports.countByStatus(db)).map((row) => [row.status, row.total]),
  );
  return {
    pending: counts.pending ?? 0,
    in_review: counts.in_review ?? 0,
    resolved: counts.resolved ?? 0,
    dismissed: counts.dismissed ?? 0,
  };
}
