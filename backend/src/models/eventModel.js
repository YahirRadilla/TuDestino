const UPCOMING = `
  FROM events e
  LEFT JOIN destinations d ON d.id = e.destination_id AND d.deleted_at IS NULL
  WHERE e.status = 'published' AND e.deleted_at IS NULL
    AND COALESCE(e.ends_at, e.starts_at) >= now()`;

const EVENT_COLUMNS = `
  e.id, e.title, e.description, e.starts_at, e.ends_at, e.location_name,
  ST_Y(e.location::geometry) AS lat, ST_X(e.location::geometry) AS lng,
  d.slug AS destination_slug, e.image_url, e.capacity,
  (SELECT count(*)::int FROM event_attendances a WHERE a.event_id = e.id) AS attendees_count`;

// Only added when a session is present; `$n` is the (bound) viewer id.
const attendingColumn = (param) =>
  `, EXISTS (SELECT 1 FROM event_attendances m WHERE m.event_id = e.id AND m.user_id = ${param}) AS attending`;

export async function findUpcoming(db, { limit, offset, userId = null }) {
  const values = [limit, offset];
  if (userId) values.push(userId);
  const { rows } = await db.query(
    `SELECT ${EVENT_COLUMNS}${userId ? attendingColumn('$3') : ''}
     ${UPCOMING}
     ORDER BY e.starts_at ASC, e.id ASC
     LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

export async function countUpcoming(db) {
  const { rows } = await db.query(`SELECT count(*)::int AS total ${UPCOMING}`);
  return rows[0].total;
}

// Published events by id, past ones included (a shared link keeps working after the event).
export async function findPublishedById(db, id, userId = null) {
  const values = [id];
  if (userId) values.push(userId);
  const { rows } = await db.query(
    `SELECT ${EVENT_COLUMNS}${userId ? attendingColumn('$2') : ''}
     FROM events e
     LEFT JOIN destinations d ON d.id = e.destination_id AND d.deleted_at IS NULL
     WHERE e.id = $1 AND e.status = 'published' AND e.deleted_at IS NULL`,
    values,
  );
  return rows[0] ?? null;
}

// Locks the event row so a concurrent cancellation cannot slip between the check and the insert.
export async function lockPublishedForAttendance(client, id) {
  const { rows } = await client.query(
    `SELECT id, COALESCE(ends_at, starts_at) >= now() AS is_open
     FROM events
     WHERE id = $1 AND status = 'published' AND deleted_at IS NULL
     FOR SHARE`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findExistingId(db, id) {
  const { rows } = await db.query('SELECT id FROM events WHERE id = $1 AND deleted_at IS NULL', [
    id,
  ]);
  return rows[0]?.id ?? null;
}

export async function insertAttendance(db, { userId, eventId }) {
  await db.query(
    `INSERT INTO event_attendances (user_id, event_id) VALUES ($1, $2)
     ON CONFLICT (user_id, event_id) DO NOTHING`,
    [userId, eventId],
  );
}

export async function deleteAttendance(db, { userId, eventId }) {
  await db.query('DELETE FROM event_attendances WHERE user_id = $1 AND event_id = $2', [
    userId,
    eventId,
  ]);
}

export async function countAttendees(db, eventId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS total FROM event_attendances WHERE event_id = $1',
    [eventId],
  );
  return rows[0].total;
}

const MINE = {
  upcoming: `COALESCE(e.ends_at, e.starts_at) >= now()`,
  past: `COALESCE(e.ends_at, e.starts_at) < now()`,
  all: 'true',
};
const MINE_ORDER = {
  upcoming: 'e.starts_at ASC, e.id ASC',
  past: 'e.starts_at DESC, e.id ASC',
  all: 'e.starts_at DESC, e.id ASC',
};

// `scope` is a key of MINE (validated upstream); the SQL fragments are constants, not input.
export async function findAttendedBy(db, userId, { scope, limit, offset }) {
  const { rows } = await db.query(
    `SELECT ${EVENT_COLUMNS}, true AS attending
     FROM event_attendances m
     JOIN events e ON e.id = m.event_id AND e.status = 'published' AND e.deleted_at IS NULL
     LEFT JOIN destinations d ON d.id = e.destination_id AND d.deleted_at IS NULL
     WHERE m.user_id = $1 AND ${MINE[scope]}
     ORDER BY ${MINE_ORDER[scope]}
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function countAttendedBy(db, userId, scope) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total
     FROM event_attendances m
     JOIN events e ON e.id = m.event_id AND e.status = 'published' AND e.deleted_at IS NULL
     WHERE m.user_id = $1 AND ${MINE[scope]}`,
    [userId],
  );
  return rows[0].total;
}
