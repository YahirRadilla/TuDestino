// Public review columns: deliberately no user_id (the author is never exposed).
const PUBLIC_COLUMNS = 'r.id, r.rating, r.comment, r.created_at, r.updated_at';

export async function findByDestination(db, destinationId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM reviews r
     WHERE r.destination_id = $1 AND r.deleted_at IS NULL
     ORDER BY r.created_at DESC, r.id ASC
     LIMIT $2 OFFSET $3`,
    [destinationId, limit, offset],
  );
  return rows;
}

export async function countByDestination(db, destinationId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS total FROM reviews WHERE destination_id = $1 AND deleted_at IS NULL',
    [destinationId],
  );
  return rows[0].total;
}

// Returns the new review or null when this user already reviewed the destination.
export async function insertIfAbsent(client, { destinationId, userId, rating, comment }) {
  const { rows } = await client.query(
    `INSERT INTO reviews (destination_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (destination_id, user_id) DO NOTHING
     RETURNING id, rating, comment, created_at, updated_at`,
    [destinationId, userId, rating, comment],
  );
  return rows[0] ?? null;
}

// `inserted` is true when the row was created and false when an existing one was replaced.
export async function upsert(client, { destinationId, userId, rating, comment }) {
  const { rows } = await client.query(
    `INSERT INTO reviews (destination_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (destination_id, user_id) DO UPDATE
       SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, deleted_at = NULL
     RETURNING id, rating, comment, created_at, updated_at, (xmax = 0) AS inserted`,
    [destinationId, userId, rating, comment],
  );
  return rows[0];
}

// Counters are recomputed from the table (never incremented) so they cannot drift.
export async function recomputeDestinationRating(client, destinationId) {
  const { rows } = await client.query(
    `UPDATE destinations d
     SET avg_rating = s.avg_rating, reviews_count = s.total
     FROM (
       SELECT COALESCE(round(avg(rating), 2), 0) AS avg_rating, count(*)::int AS total
       FROM reviews WHERE destination_id = $1 AND deleted_at IS NULL
     ) s
     WHERE d.id = $1
     RETURNING d.avg_rating::float8 AS avg_rating, d.reviews_count`,
    [destinationId],
  );
  return rows[0];
}

export async function findByUser(db, userId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, d.slug AS destination_slug, d.name AS destination_name
     FROM reviews r
     JOIN destinations d ON d.id = r.destination_id AND d.deleted_at IS NULL
     WHERE r.user_id = $1 AND r.deleted_at IS NULL
     ORDER BY r.created_at DESC, r.id ASC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function countByUser(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total
     FROM reviews r
     JOIN destinations d ON d.id = r.destination_id AND d.deleted_at IS NULL
     WHERE r.user_id = $1 AND r.deleted_at IS NULL`,
    [userId],
  );
  return rows[0].total;
}
