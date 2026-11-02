import { createQueryBuilder } from './sql.js';

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const COLUMNS = `
  e.id, e.title, e.description, e.starts_at, e.ends_at, e.location_name,
  ST_Y(e.location::geometry) AS lat, ST_X(e.location::geometry) AS lng,
  d.slug AS destination_slug, e.image_url, e.capacity, e.status,
  e.moderation_note, e.moderated_at, e.created_at, e.updated_at,
  u.full_name AS organizer_name`;

const FROM = `
  FROM events e
  LEFT JOIN destinations d ON d.id = e.destination_id AND d.deleted_at IS NULL
  LEFT JOIN users u ON u.id = e.organizer_id`;

function buildFilters({ status, q }) {
  const builder = createQueryBuilder();
  builder.where('e.deleted_at IS NULL');
  if (status) builder.where(`e.status = ${builder.bind(status)}`);
  if (q) builder.where(`e.title ILIKE ${builder.bind(`%${escapeLike(q)}%`)} ESCAPE '\\'`);
  return builder;
}

export async function findPage(db, { status, q, limit, offset }) {
  const builder = buildFilters({ status, q });
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} ${builder.whereClause()}
     ORDER BY (e.status = 'pending') DESC, e.starts_at DESC, e.id ASC
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

export async function countPending(db) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM events WHERE status = 'pending' AND deleted_at IS NULL`,
  );
  return rows[0].total;
}

export async function findById(db, id) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findDestinationId(db, slug) {
  const { rows } = await db.query(
    'SELECT id FROM destinations WHERE slug = $1 AND deleted_at IS NULL',
    [slug],
  );
  return rows[0]?.id ?? null;
}

export async function insert(db, fields) {
  const { rows } = await db.query(
    `INSERT INTO events (
       title, description, starts_at, ends_at, location_name, location, destination_id,
       image_url, capacity, organizer_id, status
     ) VALUES (
       $1, $2, $3::timestamptz, $4::timestamptz, $5,
       CASE WHEN $6::float8 IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint($6::float8, $7::float8), 4326)::geography END,
       $8, $9, $10, $11, $12
     ) RETURNING id`,
    [
      fields.title,
      fields.description,
      fields.startsAt,
      fields.endsAt,
      fields.locationName,
      fields.lng,
      fields.lat,
      fields.destinationId,
      fields.imageUrl,
      fields.capacity,
      fields.organizerId,
      fields.status,
    ],
  );
  return rows[0].id;
}

export async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT id, status, starts_at, ends_at FROM events
     WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

const SIMPLE_COLUMNS = {
  title: 'title',
  description: 'description',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  locationName: 'location_name',
  destinationId: 'destination_id',
  imageUrl: 'image_url',
  capacity: 'capacity',
};

// `changes` keys are matched against a fixed whitelist; values are always bound.
export async function update(client, id, changes) {
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(SIMPLE_COLUMNS)) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (Object.hasOwn(changes, 'lat')) {
    values.push(changes.lng, changes.lat);
    const [lng, lat] = [`$${values.length - 1}::float8`, `$${values.length}::float8`];
    sets.push(
      `location = CASE WHEN ${lng} IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography END`,
    );
  }
  if (sets.length === 0) return;
  await client.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $1`, values);
}

// Moves the event to `status` only from one of the `from` statuses; false when it was not in one.
export async function moderate(client, id, { from, status, note, moderatorId }) {
  const { rowCount } = await client.query(
    `UPDATE events
     SET status = $2, moderation_note = $3, moderated_by = $4, moderated_at = now()
     WHERE id = $1 AND deleted_at IS NULL AND status = ANY($5::text[])`,
    [id, status, note, moderatorId, from],
  );
  return rowCount > 0;
}

export async function softDelete(db, id) {
  const { rowCount } = await db.query(
    'UPDATE events SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return rowCount > 0;
}

// The proposer's own events, whatever their status. The moderator's identity is not exposed.
export async function findProposedBy(db, userId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT e.id, e.title, e.starts_at, e.ends_at, e.location_name, e.status,
            e.moderation_note, e.moderated_at, e.created_at
     FROM events e
     WHERE e.organizer_id = $1 AND e.deleted_at IS NULL
     ORDER BY e.created_at DESC, e.id ASC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function countProposedBy(db, userId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS total FROM events WHERE organizer_id = $1 AND deleted_at IS NULL',
    [userId],
  );
  return rows[0].total;
}
