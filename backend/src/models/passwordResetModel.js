// One live reset token per user: issuing a new one voids the previous ones.
export async function insertResetToken(db, { userId, tokenHash, ttlSeconds }) {
  await db.query(
    'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3::int * interval '1 second'))`,
    [userId, tokenHash, ttlSeconds],
  );
}

// Single statement = atomic: burn the token, change the password and revoke every session.
// Returns the user id, or null when the token is unknown, already used or expired.
export async function consumeResetToken(db, { tokenHash, passwordHash }) {
  const { rows } = await db.query(
    `WITH used AS (
       UPDATE password_reset_tokens SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id
     ), changed AS (
       UPDATE users SET password_hash = $2
       WHERE id IN (SELECT user_id FROM used) AND is_active
       RETURNING id
     ), revoked AS (
       UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id IN (SELECT id FROM changed) AND revoked_at IS NULL
     )
     SELECT id FROM changed`,
    [tokenHash, passwordHash],
  );
  return rows[0]?.id ?? null;
}
