export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS areas (
      id bigserial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text NOT NULL,
      email citext NOT NULL UNIQUE,
      password_hash text NOT NULL,
      avatar_url text,
      role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'authority', 'admin')),
      area_id bigint REFERENCES areas (id) ON DELETE SET NULL,
      is_active boolean NOT NULL DEFAULT true,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS users_area_id_idx ON users (area_id);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
  `);
  for (const table of ['areas', 'users', 'refresh_tokens', 'password_reset_tokens']) {
    pgm.sql(`
      CREATE OR REPLACE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS password_reset_tokens;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS areas;
  `);
};
