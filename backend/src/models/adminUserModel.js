import { createQueryBuilder } from './sql.js';

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Explicit list: `password_hash` is never selected by any admin query.
const COLUMNS = `
  u.id, u.full_name, u.email::text AS email, u.role, u.area_id::int AS area_id,
  a.name AS area_name, u.is_active, u.last_login_at, u.created_at`;

const FROM = `
  FROM users u
  LEFT JOIN areas a ON a.id = u.area_id`;

function buildFilters({ role, status, q }) {
  const builder = createQueryBuilder();
  if (role) builder.where(`u.role = ${builder.bind(role)}`);
  if (status) builder.where(`u.is_active = ${builder.bind(status === 'active')}`);
  if (q) {
    const pattern = builder.bind(`%${escapeLike(q)}%`);
    builder.where(
      `(u.full_name ILIKE ${pattern} ESCAPE '\\' OR u.email::text ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  return builder;
}

export async function findPage(db, { role, status, q, limit, offset }) {
  const builder = buildFilters({ role, status, q });
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} ${builder.whereClause()}
     ORDER BY u.created_at DESC, u.id ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
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

export async function findById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findAreas(db) {
  const { rows } = await db.query('SELECT id::int AS id, name FROM areas ORDER BY name ASC');
  return rows;
}

export async function areaExists(db, id) {
  const { rows } = await db.query('SELECT 1 FROM areas WHERE id = $1', [id]);
  return rows.length > 0;
}

// Returns the new id, or null when the email is already registered.
export async function insertStaff(db, { fullName, email, passwordHash, role, areaId }) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, area_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [fullName, email, passwordHash, role, areaId],
  );
  return rows[0]?.id ?? null;
}

// Locks every active admin (always in id order) so concurrent demotions serialise and the
// "at least one active admin" rule can be checked against a stable set.
export async function lockActiveAdmins(client) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY id FOR UPDATE`,
  );
  return rows.map((row) => row.id);
}

export async function lockById(client, id) {
  const { rows } = await client.query(
    'SELECT id, role, is_active, area_id::int AS area_id FROM users WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

const COLUMN_OF = {
  fullName: 'full_name',
  role: 'role',
  areaId: 'area_id',
  isActive: 'is_active',
};

export async function update(client, id, changes) {
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(COLUMN_OF)) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return;
  await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, values);
}
