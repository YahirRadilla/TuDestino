import { createQueryBuilder } from './sql.js';

// Staff view of citizen reports. Columns are listed explicitly; `tracking_code_hash` and
// `client_uuid` are never selected and the storage URL of an evidence never leaves this layer.

const FROM = `
  FROM reports r
  JOIN report_types t ON t.id = r.type_id`;

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function buildFilters({ status, type, folio }) {
  const builder = createQueryBuilder();
  if (status) builder.where(`r.status = ${builder.bind(status)}`);
  if (type) builder.where(`t.slug = ${builder.bind(type)}`);
  // Exact folio or a prefix of it (TD-2026-0001...): a plain anchored LIKE uses the unique index.
  if (folio) builder.where(`r.folio LIKE ${builder.bind(`${escapeLike(folio)}%`)} ESCAPE '\\'`);
  return builder;
}

export async function findPage(db, { status, type, folio, limit, offset }) {
  const builder = buildFilters({ status, type, folio });
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT r.id, r.folio, r.status, t.slug AS type_slug, t.name AS type_name,
            left(r.description, 160) AS excerpt, r.created_at, r.updated_at,
            (r.reporter_id IS NULL) AS anonymous,
            (SELECT count(*)::int FROM report_evidences e WHERE e.report_id = r.id) AS evidences_count
     ${FROM} ${builder.whereClause()}
     ORDER BY r.created_at DESC, r.id ASC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    builder.values,
  );
  return rows;
}

export async function count(db, filters) {
  const builder = buildFilters(filters);
  const { rows } = await db.query(
    `SELECT count(*)::int AS total ${FROM} ${builder.whereClause()}`,
    builder.values,
  );
  return rows[0].total;
}

export async function countByStatus(db) {
  const { rows } = await db.query(
    'SELECT status, count(*)::int AS total FROM reports GROUP BY status',
  );
  return rows;
}

// `reporter_*` is only filled when the report was NOT anonymous: an anonymous report has
// reporter_id NULL and therefore nothing to reveal.
export async function findDetail(db, id) {
  const { rows } = await db.query(
    `SELECT r.id, r.folio, r.status, r.description, r.occurred_at, r.created_at, r.updated_at,
            ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
            r.location_accuracy_m::float8 AS accuracy_m,
            t.slug AS type_slug, t.name AS type_name, t.is_sensitive,
            d.slug AS destination_slug, d.name AS destination_name,
            u.id AS reporter_id, u.full_name AS reporter_name, u.email::text AS reporter_email
     ${FROM}
     LEFT JOIN destinations d ON d.id = r.destination_id
     LEFT JOIN users u ON u.id = r.reporter_id
     WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findEvidences(db, reportId) {
  const { rows } = await db.query(
    `SELECT id::text AS id, mime_type, created_at
     FROM report_evidences WHERE report_id = $1 ORDER BY id ASC`,
    [reportId],
  );
  return rows;
}

export async function findEvidence(db, reportId, evidenceId) {
  const { rows } = await db.query(
    `SELECT id::text AS id, cloudinary_public_id AS public_id, mime_type
     FROM report_evidences WHERE report_id = $1 AND id = $2::bigint`,
    [reportId, evidenceId],
  );
  return rows[0] ?? null;
}

export async function findHistory(db, reportId) {
  const { rows } = await db.query(
    `SELECT h.id::text AS id, h.from_status, h.to_status, h.note, h.created_at,
            u.full_name AS changed_by_name
     FROM report_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.report_id = $1 ORDER BY h.created_at ASC, h.id ASC`,
    [reportId],
  );
  return rows;
}

// Row lock: two staff members changing the same report serialise here.
export async function lockForUpdate(client, id) {
  const { rows } = await client.query(
    'SELECT id, folio, status FROM reports WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

export async function updateStatus(client, id, status) {
  await client.query('UPDATE reports SET status = $2 WHERE id = $1', [id, status]);
}

export async function insertHistory(client, { reportId, fromStatus, toStatus, note, changedBy }) {
  await client.query(
    `INSERT INTO report_status_history (report_id, from_status, to_status, note, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [reportId, fromStatus, toStatus, note, changedBy],
  );
}
