import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';
import { createLogger } from '../../src/config/logger.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const PASSWORD = 'Segura#2026';
const RUN = randomUUID().slice(0, 8);
const MARK = `itest-map-${RUN}`;

// An empty patch of the Pacific, far from the seeded catalog: every assertion is scoped to it
// with a bbox, so the suite does not depend on (or disturb) other data.
const BBOX = '-100.6,9.9,-99.9,10.6';
const REAL = { lat: 10.1234, lng: -100.1234 };
const SNAPPED = { lat: 10.125, lng: -100.125 };

// Requires a migrated and seeded PostgreSQL (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('map pins API (PostgreSQL)', () => {
  let pool;
  let app;
  let logLines;
  const people = {};
  const reportUuids = [];
  const ids = {};

  const insertReport = async ({ type, status, lat, lng, description = `${MARK} detalle` }) => {
    const uuid = randomUUID();
    reportUuids.push(uuid);
    const { rows } = await pool.query(
      `INSERT INTO reports (type_id, description, location, status, tracking_code_hash,
                            client_uuid, occurred_at)
       VALUES ((SELECT id FROM report_types WHERE slug = $1), $2,
               ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, 'x', $6,
               '2026-09-15T10:00:00Z')
       RETURNING id, folio`,
      [type, description, lat, lng, status, uuid],
    );
    return rows[0];
  };

  const insertDestination = async (label, { status = 'published', deleted = false } = {}) => {
    const { rows } = await pool.query(
      `INSERT INTO destinations (slug, name, summary, category_id, location, status, deleted_at)
       VALUES ($1, $2, 'Resumen', (SELECT id FROM destination_categories ORDER BY id LIMIT 1),
               ST_SetSRID(ST_MakePoint(-100.5, 10.5), 4326)::geography, $3,
               ${deleted ? 'now()' : 'NULL'})
       RETURNING id`,
      [`${MARK}-${label}`, `${MARK} ${label}`, status],
    );
    return rows[0].id;
  };

  const login = async (email) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.data.access_token}`;
  };

  const makeUser = async (label, role) => {
    const email = `${MARK}-${label}@example.com`;
    const hash = await bcrypt.hash(PASSWORD, 4);
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
      [`${MARK} ${label}`, email, hash, role],
    );
    people[label] = await login(email);
  };

  const publicPins = (query = '') => request(app).get(`/api/v1/map/pins?bbox=${BBOX}${query}`);
  const adminPins = (who, query = '') => {
    const req = request(app).get(`/api/v1/admin/map/pins?bbox=${BBOX}${query}`);
    return who ? req.set('Authorization', people[who]) : req;
  };

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL);
    logLines = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        logLines.push(chunk.toString());
        done();
      },
    });
    app = createApp({
      clientOrigin: 'http://localhost:5173',
      db: pool,
      logger: createLogger('info', sink),
      rateLimitPerMinute: 100_000,
      admin: { rateLimit: { windowMs: 60_000, limit: 100_000 } },
      auth: {
        jwtSecret: SECRET,
        bcryptRounds: 4,
        refreshTtlSeconds: 3600,
        cookieSecure: true,
        rateLimit: { windowMs: 60_000, limit: 100_000 },
        mailer: { sendPasswordReset: async () => {}, sendInvitation: async () => {} },
      },
    });
    await makeUser('citizen', 'user');
    await makeUser('authority', 'authority');

    ids.resolved = await insertReport({
      type: 'contaminacion',
      status: 'resolved',
      ...REAL,
      description: `${MARK} SECRETO descripcion libre`,
    });
    // Same grid cell as the first one: both must collapse into the same published point.
    ids.neighbour = await insertReport({
      type: 'animal-varado',
      status: 'resolved',
      lat: 10.1262,
      lng: -100.1261,
    });
    ids.sensitive = await insertReport({
      type: 'tortuga-anidando',
      status: 'resolved',
      lat: 10.2001,
      lng: -100.2002,
    });
    ids.pending = await insertReport({
      type: 'contaminacion',
      status: 'pending',
      lat: 10.3003,
      lng: -100.3004,
    });
    ids.dismissed = await insertReport({
      type: 'contaminacion',
      status: 'dismissed',
      lat: 10.4005,
      lng: -100.4006,
    });
    ids.published = await insertDestination('publicado');
    await insertDestination('borrador', { status: 'draft' });
    await insertDestination('borrado', { deleted: true });
  });

  afterAll(async () => {
    // report_status_history is append-only on purpose: lift the guard only to remove test rows.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'ALTER TABLE report_status_history DISABLE TRIGGER report_status_history_no_update_delete',
      );
      await client.query(
        `DELETE FROM report_status_history WHERE report_id IN
           (SELECT id FROM reports WHERE client_uuid = ANY($1::uuid[]))`,
        [reportUuids],
      );
      await client.query(
        'ALTER TABLE report_status_history ENABLE TRIGGER report_status_history_no_update_delete',
      );
      await client.query('DELETE FROM reports WHERE client_uuid = ANY($1::uuid[])', [reportUuids]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.query('DELETE FROM destinations WHERE slug LIKE $1', [`${MARK}-%`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`${MARK}-%`]);
    await pool.end();
  });

  describe('GET /map/pins (public)', () => {
    it('is public and cacheable, with an ETag', async () => {
      const res = await publicPins();
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/^public/);
      expect(res.headers.etag).toBeTruthy();
      const again = await publicPins().set('If-None-Match', res.headers.etag);
      expect(again.status).toBe(304);
    });

    it('lists only published, non-deleted destinations with exact coordinates', async () => {
      const { body } = await publicPins();
      expect(body.data.destinations).toEqual([
        {
          slug: `${MARK}-publicado`,
          name: `${MARK} publicado`,
          avg_rating: 0,
          reviews_count: 0,
          category: { slug: expect.any(String), name: expect.any(String) },
          location: { lat: 10.5, lng: -100.5 },
        },
      ]);
    });

    it('lists only resolved reports of non-sensitive types', async () => {
      const { body } = await publicPins();
      expect(body.data.reports.map((pin) => pin.type.slug).sort()).toEqual([
        'animal-varado',
        'contaminacion',
      ]);
    });

    it('rounds every coordinate and never returns the original one', async () => {
      const res = await publicPins();
      for (const pin of res.body.data.reports) {
        expect(pin.location).toEqual(SNAPPED);
        expect(pin.approximate).toBe(true);
      }
      for (const original of ['10.1234', '-100.1234', '10.1262', '-100.1261']) {
        expect(res.text).not.toContain(original);
      }
    });

    it('is deterministic: the same data always yields the same pins', async () => {
      const first = await publicPins();
      const second = await publicPins();
      expect(second.body).toEqual(first.body);
    });

    it('exposes nothing but the whitelisted fields', async () => {
      const res = await publicPins();
      const [pin] = res.body.data.reports;
      expect(Object.keys(pin).sort()).toEqual(['approximate', 'id', 'location', 'month', 'type']);
      expect(pin.month).toBe('2026-09');
      expect(pin.id).toMatch(/^[0-9a-f]{16}$/);
      const everything = res.text;
      expect(everything).not.toContain('SECRETO');
      for (const secret of [
        ids.resolved.folio,
        ids.resolved.id,
        ids.sensitive.id,
        ...reportUuids,
        'tracking_code',
        'reporter',
        'evidence',
        'client_uuid',
        'description',
      ]) {
        expect(everything).not.toContain(secret);
      }
    });

    it('filters on the rounded point, so the bbox cannot be used to locate a report', async () => {
      // Real latitude 10.1234 is inside this box, the published one (10.125) is not.
      const box = '-100.6,9.9,-99.9,10.1245';
      const res = await request(app).get(`/api/v1/map/pins?bbox=${box}`);
      expect(res.body.data.reports).toEqual([]);
    });

    it('honours the bbox for destinations too', async () => {
      const res = await request(app).get('/api/v1/map/pins?bbox=-99,10,-98,11');
      expect(res.body.data.destinations).toEqual([]);
      expect(res.body.data.reports).toEqual([]);
    });

    it('caps the number of pins and reports the truncation', async () => {
      const res = await publicPins('&limit=1');
      expect(res.body.data.reports).toHaveLength(1);
      expect(res.body.meta.truncated.reports).toBe(true);
      expect(res.body.meta.truncated.destinations).toBe(false);
    });

    it('rejects an out-of-range limit and a malformed bbox', async () => {
      expect((await publicPins('&limit=501')).status).toBe(400);
      expect((await request(app).get('/api/v1/map/pins?bbox=1,2')).status).toBe(400);
    });
  });

  describe('GET /admin/map/pins (staff)', () => {
    it('answers 401 without a token and 403 to a plain user', async () => {
      expect((await adminPins()).status).toBe(401);
      const res = await adminPins('citizen');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns every status and type with exact coordinates, never cacheable', async () => {
      const res = await adminPins('authority');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      const byFolio = Object.fromEntries(res.body.data.reports.map((pin) => [pin.folio, pin]));
      expect(Object.keys(byFolio)).toHaveLength(5);
      expect(byFolio[ids.resolved.folio]).toMatchObject({
        id: ids.resolved.id,
        status: 'resolved',
        location: REAL,
        detail_path: `/admin/reportes/${ids.resolved.id}`,
      });
      expect(byFolio[ids.sensitive.folio].type.is_sensitive).toBe(true);
      expect(byFolio[ids.pending.folio].status).toBe('pending');
      expect(res.text).not.toContain('SECRETO');
    });

    it('filters by status and by type', async () => {
      const pending = await adminPins('authority', '&status=pending');
      expect(pending.body.data.reports.map((pin) => pin.folio)).toEqual([ids.pending.folio]);
      const turtles = await adminPins('authority', '&type=tortuga-anidando');
      expect(turtles.body.data.reports.map((pin) => pin.folio)).toEqual([ids.sensitive.folio]);
      expect((await adminPins('authority', '&status=bogus')).status).toBe(400);
    });

    it('applies the limit', async () => {
      const res = await adminPins('authority', '&limit=2');
      expect(res.body.data.reports).toHaveLength(2);
      expect(res.body.meta.truncated.reports).toBe(true);
    });

    it('audits the access without coordinates, folios or identifiers of reports', async () => {
      await adminPins('authority', '&status=pending');
      const entry = logLines
        .map((line) => JSON.parse(line))
        .filter((line) => line.audit === 'admin.map.pins_viewed')
        .at(-1);
      expect(entry).toMatchObject({ actorRole: 'authority', count: 1, status: 'pending' });
      const serialised = JSON.stringify(entry);
      expect(serialised).not.toContain(ids.pending.folio);
      expect(serialised).not.toContain('10.3003');
    });
  });
});
