import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';
import { createLogger } from '../../src/config/logger.js';
import { createLocalStorage } from '../../src/services/storage.js';
import { jpeg, jpegWithGps, png } from '../helpers/images.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const CLIENT_ORIGIN = 'http://localhost:5173';
const RUN = randomUUID().slice(0, 8);
const MARK = `itest-rep-${RUN}`;
const FOLIO = /^TD-\d{4}-\d{6}$/;

const auth = {
  jwtSecret: SECRET,
  bcryptRounds: 4,
  refreshTtlSeconds: 3600,
  cookieSecure: true,
  rateLimit: { windowMs: 60_000, limit: 10_000 },
  mailer: { sendPasswordReset: async () => {} },
};

// Requires a migrated and seeded PostgreSQL (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('citizen reports API (PostgreSQL)', () => {
  let pool;
  let app;
  let uploadsDir;
  let storage;
  let logLines;
  let destinationSlug;
  let destinationId;
  const uuids = [];

  const files = async () => {
    try {
      return await readdir(path.join(uploadsDir, 'reports'));
    } catch {
      return [];
    }
  };

  const post = ({ fields = {}, photos = [], token, uuid = randomUUID(), server = app } = {}) => {
    uuids.push(uuid);
    const body = {
      type: 'contaminacion',
      description: `${MARK} Basura acumulada en la orilla de la playa.`,
      lat: '24.1426',
      lng: '-110.3128',
      client_uuid: uuid,
      ...fields,
    };
    let req = request(server).post('/api/v1/reports');
    if (token) req = req.set('Authorization', token);
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) req = req.field(key, value);
    }
    photos.forEach((photo, index) => {
      req = req.attach('photos', photo, { filename: `p${index}.jpg`, contentType: 'image/jpeg' });
    });
    return req;
  };

  const register = async (label) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        full_name: `Tester ${label}`,
        email: `itest-rep-${RUN}-${label}@example.com`,
        password: 'Segura#2026',
      });
    expect(res.status).toBe(201);
    return { id: res.body.data.user.id, bearer: `Bearer ${res.body.data.access_token}` };
  };

  const row = async (folio) =>
    (await pool.query('SELECT * FROM reports WHERE folio = $1', [folio])).rows[0];

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'td-reports-'));
    storage = createLocalStorage({ uploadsDir });
    logLines = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        logLines.push(chunk.toString());
        done();
      },
    });
    app = createApp({
      clientOrigin: CLIENT_ORIGIN,
      db: pool,
      logger: createLogger('info', sink),
      rateLimitPerMinute: 10_000,
      auth,
      reports: {
        storage,
        rateLimit: { windowMs: 60_000, limit: 10_000 },
        trackRateLimit: { windowMs: 60_000, limit: 10_000 },
      },
    });
    destinationSlug = `itest-rep-${RUN}`;
    destinationId = (
      await pool.query(
        `INSERT INTO destinations (slug, name, summary, category_id, location, status)
         VALUES ($1, 'Destino de prueba', 'Resumen', (SELECT id FROM destination_categories LIMIT 1),
           ST_SetSRID(ST_MakePoint(-110.3, 24.1), 4326)::geography, 'published')
         RETURNING id`,
        [destinationSlug],
      )
    ).rows[0].id;
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
        [uuids],
      );
      await client.query(
        'ALTER TABLE report_status_history ENABLE TRIGGER report_status_history_no_update_delete',
      );
      await client.query('DELETE FROM reports WHERE client_uuid = ANY($1::uuid[])', [uuids]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.query('DELETE FROM destinations WHERE id = $1', [destinationId]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`itest-rep-${RUN}-%`]);
    await pool.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  describe('GET /report-types', () => {
    it('lists slug and name only, never the sensitivity flag', async () => {
      const res = await request(app).get('/api/v1/report-types');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      for (const type of res.body.data) expect(Object.keys(type).sort()).toEqual(['name', 'slug']);
      expect(res.body.data.map((t) => t.slug)).toContain('tortuga-anidando');
    });
  });

  describe('POST /reports', () => {
    it('creates an anonymous report: folio, one-time code, only the hash stored', async () => {
      const res = await post({ photos: [await jpeg()] });
      expect(res.status).toBe(201);
      const { folio, tracking_code: code, replayed, status, evidences_count } = res.body.data;
      expect(folio).toMatch(FOLIO);
      expect(folio.split('-')[1]).toBe(String(new Date().getFullYear()));
      expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{10}$/);
      expect([replayed, status, evidences_count]).toEqual([false, 'pending', 1]);
      expect(res.headers['cache-control']).toBe('no-store');

      const stored = await row(folio);
      expect(stored.reporter_id).toBeNull();
      expect(stored.tracking_code_hash).toBe(createHash('sha256').update(code).digest('hex'));
      expect(JSON.stringify(stored)).not.toContain(code);

      const evidences = await pool.query('SELECT * FROM report_evidences WHERE report_id = $1', [
        stored.id,
      ]);
      expect(evidences.rows).toHaveLength(1);
      expect(evidences.rows[0].mime_type).toBe('image/webp');
      expect(evidences.rows[0].url).toMatch(/^local:reports\//);

      const history = await pool.query(
        'SELECT from_status, to_status, note, changed_by FROM report_status_history WHERE report_id = $1',
        [stored.id],
      );
      expect(history.rows).toEqual([
        { from_status: null, to_status: 'pending', note: 'Reporte recibido', changed_by: null },
      ]);
    });

    it('stores the coordinates, accuracy, destination and occurred_at', async () => {
      const occurred = new Date(Date.now() - 3 * 3600_000).toISOString();
      const res = await post({
        fields: {
          accuracy_m: '18.5',
          destination_slug: destinationSlug,
          occurred_at: occurred,
          type: 'tortuga-anidando',
        },
      });
      expect(res.status).toBe(201);
      const stored = (
        await pool.query(
          `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                  location_accuracy_m::float8 AS acc, destination_id, occurred_at, t.slug
           FROM reports r JOIN report_types t ON t.id = r.type_id WHERE folio = $1`,
          [res.body.data.folio],
        )
      ).rows[0];
      expect(stored.lat).toBeCloseTo(24.1426, 6);
      expect(stored.lng).toBeCloseTo(-110.3128, 6);
      expect(stored.acc).toBe(18.5);
      expect(stored.destination_id).toBe(destinationId);
      expect(new Date(stored.occurred_at).getTime()).toBe(new Date(occurred).getTime());
      expect(stored.slug).toBe('tortuga-anidando');
    });

    it('keeps reporter_id NULL for anonymous reports even when a valid token is sent', async () => {
      const user = await register('anon');
      const res = await post({ fields: { anonymous: 'true' }, token: user.bearer });
      expect(res.status).toBe(201);
      expect((await row(res.body.data.folio)).reporter_id).toBeNull();
    });

    it('defaults to anonymous when the field is omitted', async () => {
      const user = await register('default');
      const res = await post({ token: user.bearer });
      expect((await row(res.body.data.folio)).reporter_id).toBeNull();
    });

    it('links a non-anonymous report to the signed-in user', async () => {
      const user = await register('linked');
      const res = await post({ fields: { anonymous: 'false' }, token: user.bearer });
      expect(res.status).toBe(201);
      expect((await row(res.body.data.folio)).reporter_id).toBe(user.id);
    });

    it('accepts a non-anonymous report from a visitor without linking anyone', async () => {
      const res = await post({ fields: { anonymous: 'false' } });
      expect(res.status).toBe(201);
      expect((await row(res.body.data.folio)).reporter_id).toBeNull();
    });

    it('ignores a forged token instead of failing', async () => {
      const res = await post({
        fields: { anonymous: 'false' },
        token: 'Bearer forged.token.value',
      });
      expect(res.status).toBe(201);
      expect((await row(res.body.data.folio)).reporter_id).toBeNull();
    });

    it('stores re-encoded evidence without EXIF or GPS', async () => {
      const before = (await files()).length;
      const res = await post({ photos: [await jpegWithGps(), await png()] });
      expect(res.status).toBe(201);
      const saved = (await files()).slice(before);
      expect(saved).toHaveLength(2);
      const { default: exifr } = await import('exifr');
      const { readFile } = await import('node:fs/promises');
      for (const name of saved) {
        const bytes = await readFile(path.join(uploadsDir, 'reports', name));
        expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
        expect(await exifr.gps(bytes).catch(() => undefined)).toBeUndefined();
        expect(bytes.includes(Buffer.from('EXIF'))).toBe(false);
        expect(bytes.includes(Buffer.from('TestCam'))).toBe(false);
      }
    });

    it('has no column that could hold an IP address or user agent', async () => {
      const { rows } = await pool.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_name IN ('reports','report_evidences','report_status_history','report_followers')
           AND (column_name ~* '(^|_)(ip|user_?agent|ua|remote|address|host)(_|$)')`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('idempotency', () => {
    it('answers 200 with the same folio, no second code and no duplicated rows or files', async () => {
      const uuid = randomUUID();
      const first = await post({ uuid, photos: [await jpeg()] });
      expect(first.status).toBe(201);
      const filesAfterFirst = await files();

      const again = await post({ uuid, photos: [await jpeg()] });
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({
        folio: first.body.data.folio,
        tracking_code: null,
        replayed: true,
        status: 'pending',
      });
      expect(await files()).toEqual(filesAfterFirst);
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM reports WHERE client_uuid = $1',
        [uuid],
      );
      expect(count.rows[0].n).toBe(1);
      const ev = await pool.query(
        `SELECT count(*)::int AS n FROM report_evidences e JOIN reports r ON r.id = e.report_id
         WHERE r.client_uuid = $1`,
        [uuid],
      );
      expect(ev.rows[0].n).toBe(1);
    });

    it('creates exactly one report when several identical requests race', async () => {
      const uuid = randomUUID();
      const before = (await files()).length;
      const photo = await jpeg();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => post({ uuid, photos: [photo] })),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 200, 201]);
      const folios = new Set(results.map((r) => r.body.data.folio));
      expect(folios.size).toBe(1);
      expect(results.filter((r) => r.body.data.tracking_code !== null)).toHaveLength(1);
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM reports WHERE client_uuid = $1',
        [uuid],
      );
      expect(count.rows[0].n).toBe(1);
      expect((await files()).length - before).toBe(1);
    });
  });

  describe('validation and limits', () => {
    it.each([
      ['unknown type', { type: 'no-existe' }, 'type'],
      ['short description', { description: 'corta' }, 'description'],
      ['latitude out of range', { lat: '95' }, 'lat'],
      ['longitude out of range', { lng: '-200' }, 'lng'],
      [
        'future date',
        { occurred_at: new Date(Date.now() + 86_400_000).toISOString() },
        'occurred_at',
      ],
      ['unknown destination', { destination_slug: 'no-existe' }, 'destination_slug'],
      ['bad uuid', { client_uuid: 'abc' }, 'client_uuid'],
      ['forbidden field', { reporter_id: randomUUID() }, 'reporter_id'],
    ])('rejects %s with VALIDATION_ERROR', async (_name, fields, field) => {
      const res = await post({ fields });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain(field);
    });

    it('rejects more than 4 photos', async () => {
      const photo = await jpeg();
      const res = await post({ photos: [photo, photo, photo, photo, photo] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a photo above 5 MB with PAYLOAD_TOO_LARGE', async () => {
      const big = Buffer.concat([await png(), Buffer.alloc(5 * 1024 * 1024 + 1024)]);
      const res = await post({ photos: [big] });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects an oversized request by Content-Length before reading it', async () => {
      const res = await request(app)
        .post('/api/v1/reports')
        .set('Content-Type', 'multipart/form-data; boundary=x')
        .set('Content-Length', String(30 * 1024 * 1024))
        .send('--x--');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('validates the real content, not the declared mimetype', async () => {
      const fake = post({ photos: [] }).attach('photos', Buffer.from('<svg/>'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
      const res = await fake;
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects a JSON body: reports are multipart', async () => {
      const res = await request(app)
        .post('/api/v1/reports')
        .send({ type: 'contaminacion', client_uuid: randomUUID() });
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('rate limits report creation per client', async () => {
      const limited = createApp({
        clientOrigin: CLIENT_ORIGIN,
        db: pool,
        rateLimitPerMinute: 10_000,
        auth,
        reports: { storage, rateLimit: { windowMs: 60_000, limit: 2 } },
      });
      const codes = [];
      for (let i = 0; i < 3; i += 1) {
        codes.push((await post({ server: limited })).status);
      }
      expect(codes).toEqual([201, 201, 429]);
    });
  });

  describe('atomicity', () => {
    it('rolls back the report and removes stored files when saving evidence fails', async () => {
      let calls = 0;
      const failing = {
        ...storage,
        save: async (...args) => {
          calls += 1;
          if (calls === 2) throw new Error('disk full');
          return storage.save(...args);
        },
      };
      const failingApp = createApp({
        clientOrigin: CLIENT_ORIGIN,
        db: pool,
        rateLimitPerMinute: 10_000,
        auth,
        reports: { storage: failing, rateLimit: { windowMs: 60_000, limit: 100 } },
      });
      const before = await files();
      const uuid = randomUUID();
      const photo = await jpeg();
      const res = await post({ uuid, photos: [photo, photo], server: failingApp });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(await files()).toEqual(before);
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM reports WHERE client_uuid = $1',
        [uuid],
      );
      expect(count.rows[0].n).toBe(0);
      const history = await pool.query(
        'SELECT count(*)::int AS n FROM report_status_history h JOIN reports r ON r.id = h.report_id WHERE r.client_uuid = $1',
        [uuid],
      );
      expect(history.rows[0].n).toBe(0);

      // The same client_uuid can be retried afterwards and succeeds.
      const retry = await post({ uuid, photos: [photo], server: app });
      expect(retry.status).toBe(201);
    });
  });

  describe('POST /reports/track', () => {
    let created;
    beforeAll(async () => {
      const res = await post({ photos: [await jpeg()] });
      created = res.body.data;
    });

    it('returns the status and history for the right folio and code', async () => {
      const res = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: created.folio, code: created.tracking_code });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.data).toMatchObject({ folio: created.folio, status: 'pending' });
      expect(res.body.data.history).toEqual([
        {
          from_status: null,
          to_status: 'pending',
          note: 'Reporte recibido',
          created_at: expect.any(String),
        },
      ]);
    });

    it('never exposes the author, evidence, location or hash', async () => {
      const res = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: created.folio, code: created.tracking_code });
      const text = JSON.stringify(res.body);
      for (const forbidden of [
        'reporter',
        'changed_by',
        'evidence',
        'url',
        'location',
        'hash',
        'description',
        'client_uuid',
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(Object.keys(res.body.data).sort()).toEqual([
        'created_at',
        'folio',
        'history',
        'status',
        'updated_at',
      ]);
    });

    it('tolerates lowercase and separators typed by the user', async () => {
      const typed =
        `${created.tracking_code.slice(0, 5)}-${created.tracking_code.slice(5)}`.toLowerCase();
      const res = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: created.folio.toLowerCase(), code: typed });
      expect(res.status).toBe(200);
    });

    it('answers the same 404 for a wrong code and for an unknown folio', async () => {
      const wrongCode = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: created.folio, code: 'ZZZZZZZZZZ' });
      const unknownFolio = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: 'TD-2099-999999', code: created.tracking_code });
      expect(wrongCode.status).toBe(404);
      expect(unknownFolio.status).toBe(404);
      expect(wrongCode.body).toEqual(unknownFolio.body);
      expect(wrongCode.body.error.code).toBe('REPORT_NOT_FOUND');
    });

    it('does not accept the code of another report', async () => {
      const other = (await post({})).body.data;
      const res = await request(app)
        .post('/api/v1/reports/track')
        .send({ folio: created.folio, code: other.tracking_code });
      expect(res.status).toBe(404);
    });

    it('applies a strict rate limit', async () => {
      const limited = createApp({
        clientOrigin: CLIENT_ORIGIN,
        db: pool,
        rateLimitPerMinute: 10_000,
        auth,
        reports: { storage, trackRateLimit: { windowMs: 60_000, limit: 3 } },
      });
      const statuses = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await request(limited)
          .post('/api/v1/reports/track')
          .send({ folio: created.folio, code: 'ZZZZZZZZZZ' });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([404, 404, 404, 429]);
    });
  });

  describe('privacy of logs', () => {
    it('logs no IP address, user agent, body or query for report routes', async () => {
      logLines.length = 0;
      const secretText = `${MARK} texto-secreto-${randomUUID()}`;
      const agent = `SecretAgent/${randomUUID()}`;
      const res = await post({ fields: { description: secretText } }).set('User-Agent', agent);
      expect(res.status).toBe(201);
      await request(app)
        .post('/api/v1/reports/track?lat=24.123456&lng=-110.654321')
        .set('User-Agent', agent)
        .send({ folio: res.body.data.folio, code: 'ZZZZZZZZZZ' });
      const logged = logLines.join('');
      expect(logged).toContain('"path":"/api/v1/reports"');
      expect(logged).not.toContain(secretText);
      expect(logged).not.toContain(agent);
      expect(logged).not.toContain(res.body.data.tracking_code);
      expect(logged).not.toMatch(/127\.0\.0\.1|::1\b|::ffff/);
      expect(logged).not.toContain('24.123456');
      expect(logged).not.toContain('-110.654321');
    });

    it('redacts request-shaped objects if someone logs one', () => {
      const lines = [];
      const sink = new Writable({
        write(chunk, _enc, done) {
          lines.push(chunk.toString());
          done();
        },
      });
      createLogger('info', sink).info(
        {
          req: {
            ip: '203.0.113.9',
            headers: { 'user-agent': 'Mozilla', cookie: 'a=b' },
            body: { x: 1 },
          },
          ip: '203.0.113.9',
          body: { description: 'secreto' },
        },
        'sample',
      );
      const out = lines.join('');
      expect(out).not.toContain('203.0.113.9');
      expect(out).not.toContain('Mozilla');
      expect(out).not.toContain('secreto');
      expect(out).toContain('[redacted]');
    });
  });
});
