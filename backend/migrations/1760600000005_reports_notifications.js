export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS report_types (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      is_sensitive boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS report_folio_seq;

    -- No IP address or user agent is stored on purpose (anonymity, ADR-03).
    CREATE TABLE IF NOT EXISTS reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      folio text NOT NULL UNIQUE DEFAULT (
        'TD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('report_folio_seq')::text, 6, '0')
      ),
      type_id bigint NOT NULL REFERENCES report_types (id),
      description text NOT NULL,
      location geography(Point, 4326) NOT NULL,
      location_accuracy_m numeric CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
      destination_id uuid REFERENCES destinations (id) ON DELETE SET NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
      reporter_id uuid REFERENCES users (id) ON DELETE SET NULL,
      tracking_code_hash text NOT NULL,
      client_uuid uuid NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS reports_status_type_idx ON reports (status, type_id);
    CREATE INDEX IF NOT EXISTS reports_location_gist ON reports USING gist (location);
    CREATE INDEX IF NOT EXISTS reports_destination_idx ON reports (destination_id);

    CREATE TABLE IF NOT EXISTS report_evidences (
      id bigserial PRIMARY KEY,
      report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
      url text NOT NULL,
      cloudinary_public_id text,
      mime_type text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS report_evidences_report_idx ON report_evidences (report_id);

    -- Append-only audit trail (RNF07): references are RESTRICT so no cascade ever rewrites it.
    CREATE TABLE IF NOT EXISTS report_status_history (
      id bigserial PRIMARY KEY,
      report_id uuid NOT NULL REFERENCES reports (id) ON DELETE RESTRICT,
      from_status text,
      to_status text NOT NULL
        CHECK (to_status IN ('pending', 'in_review', 'resolved', 'dismissed')),
      note text NOT NULL,
      changed_by uuid REFERENCES users (id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS report_status_history_report_idx
      ON report_status_history (report_id, created_at);

    CREATE OR REPLACE FUNCTION reject_report_history_changes() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'report_status_history is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE TRIGGER report_status_history_no_update_delete
      BEFORE UPDATE OR DELETE ON report_status_history
      FOR EACH ROW EXECUTE FUNCTION reject_report_history_changes();
    CREATE OR REPLACE TRIGGER report_status_history_no_truncate
      BEFORE TRUNCATE ON report_status_history
      FOR EACH STATEMENT EXECUTE FUNCTION reject_report_history_changes();

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id bigserial PRIMARY KEY,
      user_id uuid REFERENCES users (id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

    CREATE TABLE IF NOT EXISTS report_followers (
      report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
      subscription_id bigint NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (report_id, subscription_id)
    );
    CREATE INDEX IF NOT EXISTS report_followers_subscription_idx
      ON report_followers (subscription_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      type text NOT NULL,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      url text,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
      ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
  `);
  for (const table of [
    'report_types',
    'reports',
    'report_evidences',
    'push_subscriptions',
    'notifications',
  ]) {
    pgm.sql(`
      CREATE OR REPLACE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS report_followers;
    DROP TABLE IF EXISTS push_subscriptions;
    DROP TABLE IF EXISTS report_status_history;
    DROP FUNCTION IF EXISTS reject_report_history_changes();
    DROP TABLE IF EXISTS report_evidences;
    DROP TABLE IF EXISTS reports;
    DROP SEQUENCE IF EXISTS report_folio_seq;
    DROP TABLE IF EXISTS report_types;
  `);
};
