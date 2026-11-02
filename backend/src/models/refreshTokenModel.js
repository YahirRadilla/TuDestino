export async function insertRefreshToken(db, { userId, tokenHash, ttlSeconds, userAgent }) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + ($3::int * interval '1 second'), $4)`,
    [userId, tokenHash, ttlSeconds, userAgent?.slice(0, 255) ?? null],
  );
}

// Atomically revokes a live token (rotation). Only one concurrent caller can win.
export async function consumeRefreshToken(db, tokenHash) {
  const { rows } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

// Lets the caller tell "reused after rotation/logout" apart from "unknown or expired".
export async function findRefreshTokenState(db, tokenHash) {
  const { rows } = await db.query(
    'SELECT user_id, revoked_at IS NOT NULL AS revoked FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function revokeRefreshToken(db, tokenHash) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
}

export async function revokeAllRefreshTokens(db, userId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}
