export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS destination_categories (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS destinations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      summary text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      category_id bigint NOT NULL REFERENCES destination_categories (id),
      location geography(Point, 4326) NOT NULL,
      municipality text,
      regulations text,
      care_tips text[] NOT NULL DEFAULT '{}',
      highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_protected_area boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published')),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      avg_rating numeric(3, 2) NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
      reviews_count integer NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
      favorites_count integer NOT NULL DEFAULT 0 CHECK (favorites_count >= 0),
      search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('spanish', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('spanish', coalesce(description, '')), 'C')
      ) STORED,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS destinations_location_gist ON destinations USING gist (location);
    CREATE INDEX IF NOT EXISTS destinations_search_gin ON destinations USING gin (search_vector);
    CREATE INDEX IF NOT EXISTS destinations_category_idx ON destinations (category_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS destinations_published_idx ON destinations (status)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS destination_images (
      id bigserial PRIMARY KEY,
      destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
      url text NOT NULL,
      cloudinary_public_id text,
      alt_text text,
      position integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (destination_id, position)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      UNIQUE (destination_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews (user_id);

    CREATE TABLE IF NOT EXISTS favorites (
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, destination_id)
    );
    CREATE INDEX IF NOT EXISTS favorites_destination_id_idx ON favorites (destination_id);
  `);
  for (const table of ['destination_categories', 'destinations', 'destination_images', 'reviews']) {
    pgm.sql(`
      CREATE OR REPLACE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS favorites;
    DROP TABLE IF EXISTS reviews;
    DROP TABLE IF EXISTS destination_images;
    DROP TABLE IF EXISTS destinations;
    DROP TABLE IF EXISTS destination_categories;
  `);
};
