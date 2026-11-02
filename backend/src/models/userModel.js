// Explicit column lists: `password_hash` and any internal column never leave this layer
// unless the caller asks for the credentials variant.
const PUBLIC_COLUMNS = `id, full_name, email::text AS email, avatar_url, role,
  area_id::int AS area_id, created_at`;
const CREDENTIAL_COLUMNS = `${PUBLIC_COLUMNS}, password_hash, is_active`;

export async function findCredentialsByEmail(db, email) {
  const { rows } = await db.query(`SELECT ${CREDENTIAL_COLUMNS} FROM users WHERE email = $1`, [
    email,
  ]);
  return rows[0] ?? null;
}

export async function findPublicById(db, id) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 AND is_active`,
    [id],
  );
  return rows[0] ?? null;
}

// Returns null when the email is already registered (citext makes it case-insensitive).
export async function insertUser(db, { fullName, email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING ${PUBLIC_COLUMNS}`,
    [fullName, email, passwordHash],
  );
  return rows[0] ?? null;
}

export async function touchLastLogin(db, id) {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

const EDITABLE_COLUMNS = ['full_name', 'avatar_url'];

export async function updateProfile(db, id, changes) {
  const sets = [];
  const values = [id];
  for (const column of EDITABLE_COLUMNS) {
    if (Object.hasOwn(changes, column)) {
      values.push(changes[column]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findPublicById(db, id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND is_active RETURNING ${PUBLIC_COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}
