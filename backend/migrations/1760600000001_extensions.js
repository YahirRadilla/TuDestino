export const up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS citext');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  // Shared trigger function that keeps updated_at current.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS set_updated_at()');
  pgm.sql('DROP EXTENSION IF EXISTS pgcrypto');
  pgm.sql('DROP EXTENSION IF EXISTS citext');
  // postgis is intentionally kept: images and managed hosts preinstall it together with
  // postgis_topology, so dropping it here would fail or remove objects this migration never created.
};
