// Idempotency ledger for "event starts soon" reminders (PWA-16): one row per attendee and event.
// The reminder job claims rows with INSERT ... ON CONFLICT DO NOTHING, so a re-run (or a second API
// instance) never sends the same reminder twice.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS event_reminders (
      event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      sent_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS event_reminders_user_idx ON event_reminders (user_id);
    CREATE INDEX IF NOT EXISTS notifications_user_created_idx
      ON notifications (user_id, created_at DESC, id DESC);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS notifications_user_created_idx;
    DROP TABLE IF EXISTS event_reminders;
  `);
};
