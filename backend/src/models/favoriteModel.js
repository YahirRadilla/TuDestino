import { FROM_PUBLISHED, LIST_COLUMNS } from './destinationModel.js';

// True only when the row was really created (the caller decides whether counters must change).
export async function insertIfAbsent(client, { userId, destinationId }) {
  const { rowCount } = await client.query(
    `INSERT INTO favorites (user_id, destination_id) VALUES ($1, $2)
     ON CONFLICT (user_id, destination_id) DO NOTHING`,
    [userId, destinationId],
  );
  return rowCount === 1;
}

export async function deleteIfPresent(client, { userId, destinationId }) {
  const { rowCount } = await client.query(
    'DELETE FROM favorites WHERE user_id = $1 AND destination_id = $2',
    [userId, destinationId],
  );
  return rowCount === 1;
}

export async function recomputeFavoritesCount(client, destinationId) {
  const { rows } = await client.query(
    `UPDATE destinations
     SET favorites_count = (SELECT count(*)::int FROM favorites WHERE destination_id = $1)
     WHERE id = $1
     RETURNING favorites_count`,
    [destinationId],
  );
  return rows[0].favorites_count;
}

export async function readFavoritesCount(client, destinationId) {
  const { rows } = await client.query('SELECT favorites_count FROM destinations WHERE id = $1', [
    destinationId,
  ]);
  return rows[0].favorites_count;
}

export async function findByUser(db, userId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT ${LIST_COLUMNS}, f.created_at AS favorited_at
     ${FROM_PUBLISHED}
     JOIN favorites f ON f.destination_id = d.id
     WHERE f.user_id = $1 AND d.status = 'published' AND d.deleted_at IS NULL
     ORDER BY f.created_at DESC, d.name ASC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function countByUser(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total
     FROM favorites f
     JOIN destinations d ON d.id = f.destination_id
     WHERE f.user_id = $1 AND d.status = 'published' AND d.deleted_at IS NULL`,
    [userId],
  );
  return rows[0].total;
}
