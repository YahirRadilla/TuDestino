// Citizen reports. No IP address or user agent is ever read or written here (ADR-03).

export async function findPublicTypes(db) {
  const { rows } = await db.query('SELECT slug, name FROM report_types ORDER BY id ASC');
  return rows;
}

export async function findTypeIdBySlug(db, slug) {
  const { rows } = await db.query('SELECT id FROM report_types WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

export async function findByClientUuid(db, clientUuid) {
  const { rows } = await db.query(
    'SELECT id, folio, status, created_at FROM reports WHERE client_uuid = $1',
    [clientUuid],
  );
  return rows[0] ?? null;
}

// Returns the new row, or null when `client_uuid` already exists (an earlier or concurrent attempt
// won). Concurrent inserts of the same uuid serialise on the unique index: the loser waits for the
// winner's commit and then gets no row back.
export async function insertIfAbsent(
  client,
  {
    clientUuid,
    typeId,
    description,
    lat,
    lng,
    accuracyM,
    destinationId,
    occurredAt,
    reporterId,
    trackingCodeHash,
  },
) {
  const { rows } = await client.query(
    `INSERT INTO reports (
       client_uuid, type_id, description, location, location_accuracy_m,
       destination_id, occurred_at, reporter_id, tracking_code_hash
     ) VALUES (
       $1, $2, $3, ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography, $6::numeric,
       $7, COALESCE($8::timestamptz, now()), $9, $10
     )
     ON CONFLICT (client_uuid) DO NOTHING
     RETURNING id, folio, status, created_at`,
    [
      clientUuid,
      typeId,
      description,
      lng,
      lat,
      accuracyM ?? null,
      destinationId ?? null,
      occurredAt ?? null,
      reporterId ?? null,
      trackingCodeHash,
    ],
  );
  return rows[0] ?? null;
}

export async function insertEvidence(client, { reportId, url, publicId, mimeType }) {
  await client.query(
    `INSERT INTO report_evidences (report_id, url, cloudinary_public_id, mime_type)
     VALUES ($1, $2, $3, $4)`,
    [reportId, url, publicId, mimeType],
  );
}

export async function insertStatusHistory(client, { reportId, fromStatus, toStatus, note }) {
  await client.query(
    `INSERT INTO report_status_history (report_id, from_status, to_status, note, changed_by)
     VALUES ($1, $2, $3, $4, NULL)`,
    [reportId, fromStatus, toStatus, note],
  );
}

export async function findForTracking(db, folio) {
  const { rows } = await db.query(
    `SELECT id, folio, status, tracking_code_hash, created_at, updated_at
     FROM reports WHERE folio = $1`,
    [folio],
  );
  return rows[0] ?? null;
}

// Deliberately excludes `changed_by`: the author of a status change is never public.
export async function findHistory(db, reportId) {
  const { rows } = await db.query(
    `SELECT from_status, to_status, note, created_at
     FROM report_status_history WHERE report_id = $1 ORDER BY created_at ASC, id ASC`,
    [reportId],
  );
  return rows;
}
