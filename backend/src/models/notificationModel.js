// In-app notification inbox (feeds the bell and the Badging API). Always scoped to one user.

const COLUMNS = 'id, type, title, body, url, read_at, created_at';

export async function insert(db, { userId, type, title, body = '', url = null }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, url)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [userId, type, title, body, url],
  );
  return rows[0];
}

export async function findPage(db, userId, { unreadOnly, limit, offset }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM notifications
     WHERE user_id = $1 AND ($4::boolean IS NOT TRUE OR read_at IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset, unreadOnly],
  );
  return rows;
}

export async function count(db, userId, { unreadOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM notifications
     WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL)`,
    [userId, unreadOnly],
  );
  return rows[0].total;
}

// null when the notification does not exist or belongs to someone else.
export async function markRead(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function markAllRead(db, userId) {
  const { rowCount } = await db.query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return rowCount;
}
