import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/config/db.js';

// Every statement runs inside a transaction that is always rolled back.
async function inRollback(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertReportWithHistory(client) {
  const type = await client.query(
    `INSERT INTO report_types (slug, name) VALUES ('test-type', 'Test') RETURNING id`,
  );
  const report = await client.query(
    `INSERT INTO reports (type_id, description, location, tracking_code_hash, client_uuid)
     VALUES ($1, 'x', ST_SetSRID(ST_MakePoint(-110.3, 24.1), 4326)::geography, 'hash', gen_random_uuid())
     RETURNING id, folio, reporter_id`,
    [type.rows[0].id],
  );
  await client.query(
    `INSERT INTO report_status_history (report_id, from_status, to_status, note)
     VALUES ($1, NULL, 'pending', 'created')`,
    [report.rows[0].id],
  );
  return report.rows[0];
}

describe.skipIf(!process.env.DATABASE_URL)('database schema invariants', () => {
  let pool;
  beforeAll(() => {
    pool = createPool(process.env.DATABASE_URL);
  });
  afterAll(() => pool.end());

  it('rejects UPDATE on report_status_history (append-only trigger)', async () => {
    await inRollback(pool, async (client) => {
      await insertReportWithHistory(client);
      await expect(
        client.query(`UPDATE report_status_history SET note = 'tampered'`),
      ).rejects.toThrow(/append-only/);
    });
  });

  it('rejects DELETE on report_status_history (append-only trigger)', async () => {
    await inRollback(pool, async (client) => {
      await insertReportWithHistory(client);
      await expect(client.query('DELETE FROM report_status_history')).rejects.toThrow(
        /append-only/,
      );
    });
  });

  it('rejects TRUNCATE on report_status_history', async () => {
    await inRollback(pool, async (client) => {
      await expect(client.query('TRUNCATE report_status_history')).rejects.toThrow(/append-only/);
    });
  });

  it('generates a folio and accepts anonymous reports (reporter_id NULL)', async () => {
    await inRollback(pool, async (client) => {
      const report = await insertReportWithHistory(client);
      expect(report.folio).toMatch(/^TD-\d{4}-\d{6}$/);
      expect(report.reporter_id).toBeNull();
    });
  });

  it('enforces client_uuid uniqueness for idempotent submissions', async () => {
    await inRollback(pool, async (client) => {
      const type = await client.query(
        `INSERT INTO report_types (slug, name) VALUES ('t2', 'T2') RETURNING id`,
      );
      const insert = () =>
        client.query(
          `INSERT INTO reports (type_id, description, location, tracking_code_hash, client_uuid)
           VALUES ($1, 'x', ST_SetSRID(ST_MakePoint(-110, 24), 4326)::geography, 'h',
                   '11111111-1111-4111-8111-111111111111')`,
          [type.rows[0].id],
        );
      await insert();
      await expect(insert()).rejects.toThrow(/duplicate key/);
    });
  });

  it('rejects ratings outside 1-5', async () => {
    await inRollback(pool, async (client) => {
      const { rows } = await client.query(
        `SELECT d.id AS destination_id, u.id AS user_id FROM destinations d, users u LIMIT 1`,
      );
      await expect(
        client.query(`INSERT INTO reviews (destination_id, user_id, rating) VALUES ($1, $2, 6)`, [
          rows[0].destination_id,
          rows[0].user_id,
        ]),
      ).rejects.toThrow(/rating/);
    });
  });

  it('allows a single review per user and destination', async () => {
    await inRollback(pool, async (client) => {
      const { rows } = await client.query(
        `SELECT d.id AS destination_id, u.id AS user_id FROM destinations d, users u LIMIT 1`,
      );
      const insert = () =>
        client.query(`INSERT INTO reviews (destination_id, user_id, rating) VALUES ($1, $2, 5)`, [
          rows[0].destination_id,
          rows[0].user_id,
        ]);
      await insert();
      await expect(insert()).rejects.toThrow(/duplicate key/);
    });
  });

  it('rejects events that end before they start', async () => {
    await inRollback(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO events (title, starts_at, ends_at)
           VALUES ('x', now() + interval '2 days', now() + interval '1 day')`,
        ),
      ).rejects.toThrow(/events_ends_after_start/);
    });
  });

  it('stores only bcrypt hashes for seeded users', async () => {
    const { rows } = await pool.query('SELECT password_hash FROM users');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => /^\$2[aby]\$/.test(r.password_hash))).toBe(true);
  });

  it('seeds one user per role', async () => {
    const { rows } = await pool.query(
      `SELECT role FROM users WHERE email LIKE '%@dev.tudestino.local' ORDER BY role`,
    );
    expect(rows.map((r) => r.role)).toEqual(['admin', 'authority', 'user']);
  });
});
