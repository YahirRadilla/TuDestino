// Moderation of proposed events (D-01): who decided, when and why (shown to the proposer).
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS moderation_note text,
      ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES users (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
    CREATE INDEX IF NOT EXISTS events_status_idx ON events (status, created_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS events_organizer_idx ON events (organizer_id, created_at DESC)
      WHERE deleted_at IS NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS events_organizer_idx;
    DROP INDEX IF EXISTS events_status_idx;
    ALTER TABLE events
      DROP COLUMN IF EXISTS moderated_at,
      DROP COLUMN IF EXISTS moderated_by,
      DROP COLUMN IF EXISTS moderation_note;
  `);
};
