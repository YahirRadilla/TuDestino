// Web Push subscriptions and the anonymous follow of reports. A follower row ties a report to a
// DEVICE (subscription), never to a person (ADR-03).

// The current session decides ownership: a device that re-subscribes while signed out detaches from
// the account, so a shared phone stops receiving the previous user's notifications.
export async function upsertSubscription(db, { userId, endpoint, p256dh, auth }) {
  const { rows } = await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
     RETURNING id, (xmax = 0) AS created`,
    [userId, endpoint, p256dh, auth],
  );
  return rows[0];
}

export async function findByEndpoint(db, endpoint) {
  const { rows } = await db.query(
    'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = $1',
    [endpoint],
  );
  return rows[0] ?? null;
}

export async function deleteById(db, id) {
  await db.query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
}

export async function deleteByEndpoint(db, endpoint) {
  await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function findByUserIds(db, userIds) {
  const { rows } = await db.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE user_id = ANY($1::uuid[]) ORDER BY id`,
    [userIds],
  );
  return rows;
}

export async function findFollowers(db, reportId) {
  const { rows } = await db.query(
    `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
     FROM report_followers f JOIN push_subscriptions s ON s.id = f.subscription_id
     WHERE f.report_id = $1 ORDER BY s.id`,
    [reportId],
  );
  return rows;
}

export async function addFollower(db, { reportId, subscriptionId }) {
  await db.query(
    `INSERT INTO report_followers (report_id, subscription_id) VALUES ($1, $2)
     ON CONFLICT (report_id, subscription_id) DO NOTHING`,
    [reportId, subscriptionId],
  );
}

export async function removeFollower(db, { reportId, subscriptionId }) {
  await db.query('DELETE FROM report_followers WHERE report_id = $1 AND subscription_id = $2', [
    reportId,
    subscriptionId,
  ]);
}
