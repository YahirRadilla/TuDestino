const REMINDER_WINDOW = '24 hours';
const BATCH_SIZE = 500;
// Arbitrary constant identifying this job in pg_advisory_lock (one run across all API instances).
const LOCK_KEY = 7_201_810_001;

// Claims every attendee that is due a reminder and returns the rows. The INSERT ... ON CONFLICT is
// the idempotency guard: a row can only be claimed once, whoever runs the job and however often.
const CLAIM_SQL = `
  WITH due AS (
    SELECT a.user_id, a.event_id
    FROM event_attendances a
    JOIN events e ON e.id = a.event_id
    WHERE e.status = 'published' AND e.deleted_at IS NULL
      AND e.starts_at > $1::timestamptz
      AND e.starts_at <= $1::timestamptz + interval '${REMINDER_WINDOW}'
      AND NOT EXISTS (
        SELECT 1 FROM event_reminders r WHERE r.event_id = a.event_id AND r.user_id = a.user_id
      )
    ORDER BY e.starts_at, a.user_id
    LIMIT ${BATCH_SIZE}
  ), claimed AS (
    INSERT INTO event_reminders (event_id, user_id)
    SELECT event_id, user_id FROM due
    ON CONFLICT (event_id, user_id) DO NOTHING
    RETURNING event_id, user_id
  )
  SELECT c.user_id, c.event_id, e.title
  FROM claimed c JOIN events e ON e.id = c.event_id`;

// One pass of the reminder job. Safe to call concurrently: only the instance that wins the advisory
// lock does the work, the others return { skipped: true }.
export async function runReminderPass({ db, notifier, now = new Date() }) {
  const client = await db.connect();
  try {
    const { rows: lock } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
      LOCK_KEY,
    ]);
    if (!lock[0].locked) return { skipped: true, claimed: 0 };
    try {
      const { rows } = await client.query(CLAIM_SQL, [now]);
      if (rows.length > 0) await notifier.eventReminders(rows);
      return { skipped: false, claimed: rows.length };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

// Hourly job (REMINDERS_ENABLED). The timer never keeps the process alive and `stop()` waits for
// the pass in flight, so graceful shutdown cannot cut a run in half.
export function createReminderScheduler({
  db,
  notifier,
  logger,
  intervalMs = 60 * 60_000,
  runPass = runReminderPass,
}) {
  let timer = null;
  let current = null;

  const tick = () => {
    if (current) return current; // a slow pass is never overlapped by the next tick
    current = runPass({ db, notifier })
      .then((result) => {
        if (result.claimed > 0) logger?.info({ claimed: result.claimed }, 'recordatorios enviados');
        return result;
      })
      .catch((error) => {
        logger?.error({ err: error }, 'falló el trabajo de recordatorios');
      })
      .finally(() => {
        current = null;
      });
    return current;
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
      timer.unref();
      tick();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await current;
    },
    tick,
  };
}
