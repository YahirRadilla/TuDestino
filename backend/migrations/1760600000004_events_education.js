export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      starts_at timestamptz NOT NULL,
      ends_at timestamptz,
      location_name text,
      location geography(Point, 4326),
      destination_id uuid REFERENCES destinations (id) ON DELETE SET NULL,
      image_url text,
      capacity integer CHECK (capacity IS NULL OR capacity > 0),
      organizer_id uuid REFERENCES users (id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'cancelled', 'rejected')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT events_ends_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
    );
    CREATE INDEX IF NOT EXISTS events_location_gist ON events USING gist (location);
    CREATE INDEX IF NOT EXISTS events_upcoming_idx ON events (starts_at)
      WHERE status = 'published' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS events_destination_idx ON events (destination_id);

    CREATE TABLE IF NOT EXISTS event_attendances (
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS event_attendances_event_idx ON event_attendances (event_id);

    CREATE TABLE IF NOT EXISTS edu_categories (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS edu_contents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      slug text NOT NULL UNIQUE,
      type text NOT NULL CHECK (type IN ('article', 'video', 'link')),
      body text NOT NULL DEFAULT '',
      media_url text,
      cover_url text,
      category_id bigint NOT NULL REFERENCES edu_categories (id),
      author_id uuid REFERENCES users (id) ON DELETE SET NULL,
      is_published boolean NOT NULL DEFAULT false,
      published_at timestamptz,
      search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce(body, '')), 'C')
      ) STORED,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS edu_contents_search_gin ON edu_contents USING gin (search_vector);
    CREATE INDEX IF NOT EXISTS edu_contents_listing_idx ON edu_contents (category_id, published_at DESC)
      WHERE is_published AND deleted_at IS NULL;
  `);
  for (const table of ['events', 'edu_categories', 'edu_contents']) {
    pgm.sql(`
      CREATE OR REPLACE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS edu_contents;
    DROP TABLE IF EXISTS edu_categories;
    DROP TABLE IF EXISTS event_attendances;
    DROP TABLE IF EXISTS events;
  `);
};
