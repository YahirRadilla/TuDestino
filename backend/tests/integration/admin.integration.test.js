import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';
import { createLogger } from '../../src/config/logger.js';
import { createLocalStorage } from '../../src/services/storage.js';
import { jpeg } from '../helpers/images.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const CLIENT_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Segura#2026';
const RUN = randomUUID().slice(0, 8);
const MARK = `itest-adm-${RUN}`;
const DAY = 86_400_000;
const inDays = (days) => new Date(Date.now() + days * DAY).toISOString();

// Requires a migrated and seeded PostgreSQL (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('staff panel API (PostgreSQL)', () => {
  let pool;
  let app;
  let uploadsDir;
  let logLines;
  let mailer;
  let areaId;
  const people = {};
  const reportUuids = [];

  const as = (who) => ({ Authorization: people[who].bearer });
  const api = (method, url, who) => {
    const req = request(app)[method](`/api/v1${url}`);
    return who ? req.set(as(who)) : req;
  };

  const login = async (email) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.data.access_token}`;
  };

  const makeUser = async (label, role, area = null) => {
    const email = `${MARK}-${label}@example.com`;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, area_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`${MARK} ${label}`, email, hash, role, area],
    );
    people[label] = { id: rows[0].id, email, bearer: await login(email) };
    return people[label];
  };

  const createReport = async ({ token, fields = {}, photos = 1 } = {}) => {
    const uuid = randomUUID();
    reportUuids.push(uuid);
    const fieldsToSend = {
      type: 'contaminacion',
      description: `${MARK} Basura acumulada en la orilla de la playa.`,
      lat: '24.1426',
      lng: '-110.3128',
      client_uuid: uuid,
      ...fields,
    };
    let req = request(app).post('/api/v1/reports');
    for (const [key, value] of Object.entries(fieldsToSend)) req = req.field(key, value);
    if (token) req = req.set('Authorization', token);
    for (let i = 0; i < photos; i += 1) {
      req = req.attach('photos', await jpeg(), {
        filename: `p${i}.jpg`,
        contentType: 'image/jpeg',
      });
    }
    const res = await req;
    expect(res.status).toBe(201);
    const detail = await pool.query('SELECT id FROM reports WHERE folio = $1', [
      res.body.data.folio,
    ]);
    return { ...res.body.data, id: detail.rows[0].id };
  };

  const eventBody = (overrides = {}) => ({
    title: `${MARK} Limpieza de playa`,
    description: 'Trae guantes y bolsas reutilizables.',
    starts_at: inDays(10),
    location_name: 'Playa El Tesoro',
    ...overrides,
  });

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'td-admin-'));
    logLines = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        logLines.push(chunk.toString());
        done();
      },
    });
    mailer = { sendPasswordReset: vi.fn(), sendInvitation: vi.fn(async () => {}) };
    app = createApp({
      clientOrigin: CLIENT_ORIGIN,
      db: pool,
      logger: createLogger('info', sink),
      rateLimitPerMinute: 100_000,
      admin: {
        rateLimit: { windowMs: 60_000, limit: 100_000 },
        writeRateLimit: { windowMs: 60_000, limit: 100_000 },
        proposalRateLimit: { windowMs: 60_000, limit: 100_000 },
      },
      auth: {
        jwtSecret: SECRET,
        bcryptRounds: 4,
        refreshTtlSeconds: 3600,
        cookieSecure: true,
        rateLimit: { windowMs: 60_000, limit: 100_000 },
        mailer,
      },
      reports: {
        storage: createLocalStorage({ uploadsDir }),
        rateLimit: { windowMs: 60_000, limit: 100_000 },
        trackRateLimit: { windowMs: 60_000, limit: 100_000 },
      },
    });
    areaId = (
      await pool.query(`INSERT INTO areas (name) VALUES ($1) RETURNING id`, [`${MARK} area`])
    ).rows[0].id;
    await makeUser('citizen', 'user');
    await makeUser('citizen2', 'user');
    await makeUser('authority', 'authority', areaId);
    await makeUser('admin', 'admin');
    await makeUser('admin2', 'admin');
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
    await pool.query('DELETE FROM events WHERE title LIKE $1', [`${MARK}%`]);
    await pool.query('DELETE FROM destinations WHERE name LIKE $1', [`${MARK}%`]);
    await pool.query('DELETE FROM edu_contents WHERE title LIKE $1', [`${MARK}%`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`${MARK}-%`]);
    await pool.query('DELETE FROM areas WHERE id = $1', [areaId]);
    await pool.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  describe('access control', () => {
    const staffRoutes = [
      ['get', '/admin/summary'],
      ['get', '/admin/reports'],
      ['get', '/admin/destinations'],
      ['get', '/admin/events'],
      ['get', '/admin/edu-contents'],
    ];
    const adminRoutes = [
      ['get', '/admin/users'],
      ['get', '/admin/areas'],
    ];

    it.each([...staffRoutes, ...adminRoutes])(
      '%s %s answers 401 without a token',
      async (method, url) => {
        const res = await api(method, url);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      },
    );

    it.each([...staffRoutes, ...adminRoutes])(
      '%s %s answers 403 to a plain user',
      async (method, url) => {
        const res = await api(method, url, 'citizen');
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      },
    );

    it.each(adminRoutes)('%s %s answers 403 to an authority', async (method, url) => {
      expect((await api(method, url, 'authority')).status).toBe(403);
    });

    it.each(staffRoutes)('%s %s is open to authority and admin', async (method, url) => {
      expect((await api(method, url, 'authority')).status).toBe(200);
      expect((await api(method, url, 'admin')).status).toBe(200);
    });

    it('never lets a cache keep staff responses', async () => {
      const res = await api('get', '/admin/summary', 'authority');
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    it('revokes access the moment an account is deactivated, despite a live token', async () => {
      const temp = await makeUser('temp-staff', 'authority');
      expect((await api('get', '/admin/reports', 'temp-staff')).status).toBe(200);
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [temp.id]);
      const res = await api('get', '/admin/reports', 'temp-staff');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SESSION');
    });

    it('drops staff privileges the moment the role is lowered, despite a live token', async () => {
      const temp = await makeUser('demoted', 'authority');
      await pool.query(`UPDATE users SET role = 'user' WHERE id = $1`, [temp.id]);
      expect((await api('get', '/admin/reports', 'demoted')).status).toBe(403);
    });

    it('validates path parameters', async () => {
      const res = await api('get', '/admin/reports/not-a-uuid', 'authority');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rate limits staff writes', async () => {
      const limited = createApp({
        clientOrigin: CLIENT_ORIGIN,
        db: pool,
        rateLimitPerMinute: 100_000,
        admin: { writeRateLimit: { windowMs: 60_000, limit: 2 } },
        auth: { jwtSecret: SECRET, bcryptRounds: 4, refreshTtlSeconds: 3600, mailer },
      });
      const statuses = [];
      for (let i = 0; i < 3; i += 1) {
        const res = await request(limited)
          .patch(`/api/v1/admin/reports/${randomUUID()}/status`)
          .set(as('authority'))
          .send({ status: 'in_review', note: 'prueba de límite' });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([404, 404, 429]);
    });
  });

  describe('reports', () => {
    let anonymous;
    let named;

    beforeAll(async () => {
      anonymous = await createReport({ fields: { anonymous: 'true' }, photos: 2 });
      named = await createReport({
        token: people.citizen.bearer,
        fields: { anonymous: 'false', type: 'animal-varado' },
        photos: 1,
      });
    });

    it('lists reports newest first with pagination and no secrets', async () => {
      const res = await api('get', '/admin/reports?limit=50', 'authority');
      expect(res.status).toBe(200);
      const folios = res.body.data.map((r) => r.folio);
      expect(folios).toEqual(expect.arrayContaining([anonymous.folio, named.folio]));
      expect(folios.indexOf(named.folio)).toBeLessThan(folios.indexOf(anonymous.folio));
      expect(res.body.meta).toMatchObject({ page: 1, limit: 50 });
      const text = JSON.stringify(res.body);
      for (const forbidden of ['tracking_code', 'client_uuid', 'reporter_id', 'local:']) {
        expect(text).not.toContain(forbidden);
      }
      const item = res.body.data.find((r) => r.folio === anonymous.folio);
      expect(item).toMatchObject({
        status: 'pending',
        anonymous: true,
        evidences_count: 2,
        type: { slug: 'contaminacion' },
      });
    });

    it('filters by status and type', async () => {
      const byType = await api('get', '/admin/reports?type=animal-varado&limit=50', 'authority');
      const folios = byType.body.data.map((r) => r.folio);
      expect(folios).toContain(named.folio);
      expect(folios).not.toContain(anonymous.folio);
      const byStatus = await api('get', '/admin/reports?status=resolved&limit=50', 'authority');
      expect(byStatus.body.data.map((r) => r.folio)).not.toContain(named.folio);
    });

    it('searches by exact folio and by prefix, case-insensitively', async () => {
      const exact = await api('get', `/admin/reports?folio=${named.folio}`, 'authority');
      expect(exact.body.data.map((r) => r.folio)).toEqual([named.folio]);
      const prefix = await api(
        'get',
        `/admin/reports?folio=${named.folio.slice(0, -2).toLowerCase()}`,
        'authority',
      );
      expect(prefix.body.data.map((r) => r.folio)).toContain(named.folio);
      const none = await api('get', '/admin/reports?folio=TD-1999-', 'authority');
      expect(none.body.data).toEqual([]);
    });

    it('refuses LIKE wildcards in the folio search', async () => {
      const res = await api('get', '/admin/reports?folio=TD-%25', 'authority');
      expect(res.status).toBe(400);
    });

    it('rejects invalid filters', async () => {
      expect((await api('get', '/admin/reports?status=bogus', 'authority')).status).toBe(400);
      expect((await api('get', '/admin/reports?limit=500', 'authority')).status).toBe(400);
    });

    it('never reveals the author of an anonymous report', async () => {
      const res = await api('get', `/admin/reports/${anonymous.id}`, 'admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ anonymous: true, reporter: null });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(people.citizen.id);
      expect(text).not.toContain(people.citizen.email);
      expect(text).not.toContain('reporter_id');
    });

    it('shows the reporter of a report that was NOT anonymous', async () => {
      const res = await api('get', `/admin/reports/${named.id}`, 'authority');
      expect(res.body.data.anonymous).toBe(false);
      expect(res.body.data.reporter).toEqual({
        id: people.citizen.id,
        full_name: `${MARK} citizen`,
        email: people.citizen.email,
      });
    });

    it('returns location, type, evidences (protected paths only) and the full history', async () => {
      const res = await api('get', `/admin/reports/${anonymous.id}`, 'authority');
      const { data } = res.body;
      expect(data.location.lat).toBeCloseTo(24.1426, 6);
      expect(data.location.lng).toBeCloseTo(-110.3128, 6);
      expect(data.type).toMatchObject({ slug: 'contaminacion' });
      expect(data.evidences).toHaveLength(2);
      for (const evidence of data.evidences) {
        expect(evidence.download_path).toBe(
          `/admin/reports/${anonymous.id}/evidences/${evidence.id}`,
        );
        expect(Object.keys(evidence).sort()).toEqual([
          'created_at',
          'download_path',
          'id',
          'mime_type',
        ]);
      }
      expect(data.history).toHaveLength(1);
      expect(data.history[0]).toMatchObject({ from_status: null, to_status: 'pending' });
      expect(data.allowed_transitions).toEqual(['in_review', 'dismissed']);
      const text = JSON.stringify(res.body);
      for (const forbidden of [
        'tracking_code',
        'client_uuid',
        'password',
        'token_hash',
        'local:',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('answers 404 for an unknown report', async () => {
      const res = await api('get', `/admin/reports/${randomUUID()}`, 'authority');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REPORT_NOT_FOUND');
    });

    describe('evidence files', () => {
      let evidenceUrl;
      beforeAll(async () => {
        const detail = await api('get', `/admin/reports/${anonymous.id}`, 'authority');
        evidenceUrl = `/admin/reports/${anonymous.id}/evidences/${detail.body.data.evidences[0].id}`;
      });

      it('requires a session', async () => {
        expect((await api('get', evidenceUrl)).status).toBe(401);
      });

      it('is forbidden to plain users', async () => {
        expect((await api('get', evidenceUrl, 'citizen')).status).toBe(403);
      });

      it('streams the image to staff with private, no-store caching', async () => {
        const res = await api('get', evidenceUrl, 'authority')
          .buffer(true)
          .parse((r, done) => {
            const chunks = [];
            r.on('data', (c) => chunks.push(c));
            r.on('end', () => done(null, Buffer.concat(chunks)));
          });
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['content-type']).toBe('image/webp');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.body.subarray(0, 4).toString()).toBe('RIFF');
        expect(res.body.subarray(8, 12).toString()).toBe('WEBP');
      });

      it('does not serve an evidence through another report', async () => {
        const detail = await api('get', `/admin/reports/${anonymous.id}`, 'authority');
        const res = await api(
          'get',
          `/admin/reports/${named.id}/evidences/${detail.body.data.evidences[0].id}`,
          'authority',
        );
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('EVIDENCE_NOT_FOUND');
      });

      it('has no public route to the uploads', async () => {
        for (const url of ['/api/v1/uploads/x', '/uploads/reports/x.webp', '/api/v1/evidences/1']) {
          expect((await request(app).get(url)).status).toBe(404);
        }
      });
    });

    describe('status changes', () => {
      let report;
      beforeAll(async () => {
        report = await createReport({ fields: { anonymous: 'true' }, photos: 0 });
      });

      const patch = (who, body, id = report.id) =>
        api('patch', `/admin/reports/${id}/status`, who).send(body);

      it('requires a note of 3 to 1000 characters', async () => {
        for (const note of [undefined, '', '  ', 'ab', 'x'.repeat(1001)]) {
          const res = await patch('authority', { status: 'in_review', note });
          expect(res.status).toBe(400);
          expect(res.body.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('rejects unknown fields and statuses', async () => {
        expect((await patch('authority', { status: 'bogus', note: 'nota válida' })).status).toBe(
          400,
        );
        expect(
          (await patch('authority', { status: 'in_review', note: 'nota válida', description: 'x' }))
            .status,
        ).toBe(400);
      });

      it('is forbidden to plain users', async () => {
        expect((await patch('citizen', { status: 'in_review', note: 'nota válida' })).status).toBe(
          403,
        );
      });

      it('rejects a transition that skips a step with 409 INVALID_TRANSITION', async () => {
        const res = await patch('authority', { status: 'resolved', note: 'intento inválido' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INVALID_TRANSITION');
        const row = await pool.query('SELECT status FROM reports WHERE id = $1', [report.id]);
        expect(row.rows[0].status).toBe('pending');
      });

      it('applies a valid transition atomically: status, history row, author and note', async () => {
        const res = await patch('authority', { status: 'in_review', note: 'Revisamos el aviso' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('in_review');
        expect(res.body.data.allowed_transitions).toEqual(['resolved', 'dismissed', 'pending']);
        expect(res.body.data.history).toHaveLength(2);
        expect(res.body.data.history[1]).toMatchObject({
          from_status: 'pending',
          to_status: 'in_review',
          note: 'Revisamos el aviso',
          changed_by: { full_name: `${MARK} authority` },
        });
        const rows = await pool.query(
          'SELECT changed_by FROM report_status_history WHERE report_id = $1 ORDER BY id',
          [report.id],
        );
        expect(rows.rows.map((r) => r.changed_by)).toEqual([null, people.authority.id]);
      });

      it('shows the new status and note on the public tracking page, without the author', async () => {
        const res = await request(app)
          .post('/api/v1/reports/track')
          .send({ folio: report.folio, code: report.tracking_code });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('in_review');
        expect(res.body.data.history.at(-1).note).toBe('Revisamos el aviso');
        expect(JSON.stringify(res.body)).not.toContain('changed_by');
      });

      it('lets an authority send it back to pending but not reopen a closed report', async () => {
        expect(
          (await patch('authority', { status: 'pending', note: 'Falta información' })).status,
        ).toBe(200);
        await patch('authority', { status: 'in_review', note: 'Retomamos el caso' });
        expect(
          (await patch('authority', { status: 'resolved', note: 'Se limpió la zona' })).status,
        ).toBe(200);
        const res = await patch('authority', { status: 'in_review', note: 'Quiero reabrirlo' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INVALID_TRANSITION');
      });

      it('lets an admin reopen a resolved report', async () => {
        const res = await patch('admin', {
          status: 'in_review',
          note: 'Reabierto por denuncia nueva',
        });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('in_review');
      });

      it('answers 404 for an unknown report', async () => {
        const res = await patch(
          'authority',
          { status: 'in_review', note: 'nota válida' },
          randomUUID(),
        );
        expect(res.status).toBe(404);
      });

      it('serialises concurrent changes: exactly one wins, both leave a coherent history', async () => {
        const target = await createReport({ photos: 0 });
        const results = await Promise.all([
          patch('authority', { status: 'in_review', note: 'Voy a revisarlo' }, target.id),
          patch('admin', { status: 'dismissed', note: 'Es un duplicado' }, target.id),
        ]);
        const codes = results.map((r) => r.status).sort();
        // pending -> in_review, then in_review -> dismissed is also valid, so the second may follow
        // the first; what can never happen is a lost update or an out-of-order history.
        const history = (
          await pool.query(
            'SELECT from_status, to_status FROM report_status_history WHERE report_id = $1 ORDER BY id',
            [target.id],
          )
        ).rows;
        const final = (await pool.query('SELECT status FROM reports WHERE id = $1', [target.id]))
          .rows[0].status;
        expect(history.at(-1).to_status).toBe(final);
        for (let i = 1; i < history.length; i += 1) {
          expect(history[i].from_status).toBe(history[i - 1].to_status);
        }
        expect(codes.filter((c) => c === 200).length).toBe(history.length - 1);
      });

      it('keeps the history append-only even for the database owner', async () => {
        await expect(
          pool.query(`UPDATE report_status_history SET note = 'editado' WHERE report_id = $1`, [
            report.id,
          ]),
        ).rejects.toThrow(/append-only/);
        await expect(
          pool.query('DELETE FROM report_status_history WHERE report_id = $1', [report.id]),
        ).rejects.toThrow(/append-only/);
      });

      it('offers no way to edit or delete the original report', async () => {
        for (const method of ['put', 'patch', 'delete']) {
          const res = await api(method, `/admin/reports/${report.id}`, 'admin').send({
            description: 'reescrito',
          });
          expect(res.status).toBe(404);
        }
        const row = await pool.query('SELECT description FROM reports WHERE id = $1', [report.id]);
        expect(row.rows[0].description).toContain(MARK);
      });

      it('logs the action without the note', async () => {
        const note = `nota-secreta-${randomUUID()}`;
        const target = await createReport({ photos: 0 });
        logLines.length = 0;
        await patch('authority', { status: 'in_review', note }, target.id);
        const logged = logLines.join('');
        expect(logged).toContain('"audit":"admin.report.status_changed"');
        expect(logged).toContain(target.folio);
        expect(logged).toContain(people.authority.id);
        expect(logged).not.toContain(note);
        expect(logged).not.toContain(people.authority.email);
      });
    });

    it('counts reports by status in the summary', async () => {
      const res = await api('get', '/admin/summary', 'authority');
      expect(Object.keys(res.body.data.reports).sort()).toEqual([
        'dismissed',
        'in_review',
        'pending',
        'resolved',
      ]);
      expect(res.body.data.reports.pending).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.data.pending_events).toBe('number');
    });
  });

  describe('destinations', () => {
    const body = (overrides = {}) => ({
      name: `${MARK} Playa Escondida`,
      summary: 'Una playa tranquila.',
      description: 'Descripción larga del destino.',
      category: 'playa',
      lat: 24.15,
      lng: -110.31,
      municipality: 'La Paz',
      care_tips: ['Lleva tu basura', 'No toques la fauna'],
      images: [
        { url: '/img/playa-escondida-1.svg', alt_text: 'Vista de la playa' },
        { url: 'https://cdn.example.com/p2.jpg' },
      ],
      ...overrides,
    });
    let created;

    it('creates a draft with a generated slug, images and coordinates', async () => {
      const res = await api('post', '/admin/destinations', 'authority').send(body());
      expect(res.status).toBe(201);
      created = res.body.data;
      expect(created).toMatchObject({
        status: 'draft',
        slug: `${MARK}-playa-escondida`,
        category: { slug: 'playa' },
        care_tips: ['Lleva tu basura', 'No toques la fauna'],
      });
      expect(created.location.lat).toBeCloseTo(24.15, 6);
      expect(created.images).toEqual([
        { url: '/img/playa-escondida-1.svg', alt_text: 'Vista de la playa' },
        { url: 'https://cdn.example.com/p2.jpg', alt_text: null },
      ]);
      const row = await pool.query('SELECT created_by FROM destinations WHERE id = $1', [
        created.id,
      ]);
      expect(row.rows[0].created_by).toBe(people.authority.id);
    });

    it('keeps drafts out of the public API but lists them to staff', async () => {
      expect((await request(app).get(`/api/v1/destinations/${created.slug}`)).status).toBe(404);
      const list = await api(
        'get',
        `/admin/destinations?q=${encodeURIComponent(MARK)}`,
        'authority',
      );
      expect(list.body.data.map((d) => d.id)).toContain(created.id);
    });

    it('generates a distinct slug when the name repeats', async () => {
      const res = await api('post', '/admin/destinations', 'admin').send(body());
      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe(`${created.slug}-2`);
    });

    it('rejects a duplicated explicit slug with 409', async () => {
      const res = await api('post', '/admin/destinations', 'admin').send(
        body({ slug: created.slug }),
      );
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLUG_TAKEN');
    });

    it.each([
      ['unknown category', { category: 'no-existe' }],
      ['latitude out of range', { lat: 95 }],
      ['short name', { name: 'x' }],
      ['insecure image', { images: [{ url: 'http://example.com/a.jpg' }] }],
      ['forbidden field', { created_by: randomUUID() }],
      ['bad status', { status: 'pending' }],
    ])('rejects %s', async (_name, overrides) => {
      const res = await api('post', '/admin/destinations', 'authority').send(body(overrides));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('publishes, edits and replaces images', async () => {
      const res = await api('patch', `/admin/destinations/${created.id}`, 'authority').send({
        status: 'published',
        summary: 'Resumen nuevo',
        lat: 24.2,
        lng: -110.4,
        images: [{ url: '/img/nueva.svg', alt_text: 'Nueva' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'published', summary: 'Resumen nuevo' });
      expect(res.body.data.images).toEqual([{ url: '/img/nueva.svg', alt_text: 'Nueva' }]);
      const publicRes = await request(app).get(`/api/v1/destinations/${created.slug}`);
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.data.location.lat).toBeCloseTo(24.2, 6);
    });

    it('requires lat and lng together and at least one field', async () => {
      expect(
        (await api('patch', `/admin/destinations/${created.id}`, 'authority').send({ lat: 24 }))
          .status,
      ).toBe(400);
      expect(
        (await api('patch', `/admin/destinations/${created.id}`, 'authority').send({})).status,
      ).toBe(400);
    });

    it('answers 404 when editing something that does not exist', async () => {
      const res = await api('patch', `/admin/destinations/${randomUUID()}`, 'authority').send({
        summary: 'x',
      });
      expect(res.status).toBe(404);
    });

    it('soft-deletes: gone from the public API and from the staff list, row kept', async () => {
      const res = await api('delete', `/admin/destinations/${created.id}`, 'authority');
      expect(res.status).toBe(204);
      expect((await request(app).get(`/api/v1/destinations/${created.slug}`)).status).toBe(404);
      const publicList = await request(app).get('/api/v1/destinations?limit=50&q=Escondida');
      expect(publicList.body.data.map((d) => d.slug)).not.toContain(created.slug);
      const list = await api(
        'get',
        `/admin/destinations?q=${encodeURIComponent(MARK)}`,
        'authority',
      );
      expect(list.body.data.map((d) => d.id)).not.toContain(created.id);
      const row = await pool.query('SELECT deleted_at FROM destinations WHERE id = $1', [
        created.id,
      ]);
      expect(row.rows[0].deleted_at).not.toBeNull();
      expect((await api('delete', `/admin/destinations/${created.id}`, 'authority')).status).toBe(
        404,
      );
    });

    it('is forbidden to plain users', async () => {
      expect((await api('post', '/admin/destinations', 'citizen').send(body())).status).toBe(403);
    });
  });

  describe('events and proposals', () => {
    it('staff create published events that appear in the public API', async () => {
      const res = await api('post', '/admin/events', 'authority').send(
        eventBody({ lat: 24.1, lng: -110.3, capacity: 40 }),
      );
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'published', capacity: 40 });
      const publicRes = await request(app).get(`/api/v1/events/${res.body.data.id}`);
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.data.title).toBe(`${MARK} Limpieza de playa`);
    });

    it('does not allow creating events in the past (HU-A06)', async () => {
      const res = await api('post', '/admin/events', 'authority').send(
        eventBody({ starts_at: inDays(-2) }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('starts_at');
    });

    it('rejects an end before the start and half a coordinate', async () => {
      const ends = await api('post', '/admin/events', 'authority').send(
        eventBody({ ends_at: inDays(5) }),
      );
      expect(ends.status).toBe(400);
      expect(ends.body.error.message).toContain('ends_at');
      const half = await api('post', '/admin/events', 'authority').send(eventBody({ lat: 24 }));
      expect(half.status).toBe(400);
    });

    it('rejects an unknown destination', async () => {
      const res = await api('post', '/admin/events', 'authority').send(
        eventBody({ destination_slug: 'no-existe' }),
      );
      expect(res.status).toBe(400);
    });

    it('edits an event and checks the end against the stored start', async () => {
      const created = await api('post', '/admin/events', 'admin').send(
        eventBody({ title: `${MARK} Para editar`, ends_at: inDays(11) }),
      );
      const id = created.body.data.id;
      const ok = await api('patch', `/admin/events/${id}`, 'admin').send({
        title: `${MARK} Editado`,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.title).toBe(`${MARK} Editado`);
      const bad = await api('patch', `/admin/events/${id}`, 'admin').send({ ends_at: inDays(2) });
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toContain('ends_at');
      const cleared = await api('patch', `/admin/events/${id}`, 'admin').send({ ends_at: null });
      expect(cleared.body.data.ends_at).toBeNull();
    });

    it('soft-deletes an event: gone from the public API, row kept', async () => {
      const created = await api('post', '/admin/events', 'admin').send(
        eventBody({ title: `${MARK} Borrable` }),
      );
      const id = created.body.data.id;
      expect((await api('delete', `/admin/events/${id}`, 'admin')).status).toBe(204);
      expect((await request(app).get(`/api/v1/events/${id}`)).status).toBe(404);
      const row = await pool.query('SELECT deleted_at FROM events WHERE id = $1', [id]);
      expect(row.rows[0].deleted_at).not.toBeNull();
      expect((await api('delete', `/admin/events/${id}`, 'admin')).status).toBe(404);
    });

    describe('proposal -> moderation (D-01 / RF20)', () => {
      let proposal;

      it('requires a session to propose', async () => {
        expect((await request(app).post('/api/v1/events').send(eventBody())).status).toBe(401);
      });

      it('lets a user propose: the event is pending and organized by them', async () => {
        const res = await api('post', '/events', 'citizen').send(
          eventBody({ title: `${MARK} Propuesta ciudadana` }),
        );
        expect(res.status).toBe(201);
        proposal = res.body.data;
        expect(proposal).toMatchObject({ status: 'pending', moderation_note: null });
        const row = await pool.query('SELECT organizer_id FROM events WHERE id = $1', [
          proposal.id,
        ]);
        expect(row.rows[0].organizer_id).toBe(people.citizen.id);
      });

      it('applies the same validation as the staff form', async () => {
        const res = await api('post', '/events', 'citizen').send(
          eventBody({ starts_at: inDays(-1) }),
        );
        expect(res.status).toBe(400);
        const forged = await api('post', '/events', 'citizen').send(
          eventBody({ status: 'published', organizer_id: people.admin.id }),
        );
        expect(forged.status).toBe(400);
      });

      it('keeps the pending event out of the public API', async () => {
        expect((await request(app).get(`/api/v1/events/${proposal.id}`)).status).toBe(404);
        const list = await request(app).get('/api/v1/events?limit=50');
        expect(list.body.data.map((e) => e.id)).not.toContain(proposal.id);
      });

      it('shows it to the proposer as pending, and only to them', async () => {
        const mine = await api('get', '/me/events/proposed', 'citizen');
        expect(mine.status).toBe(200);
        expect(mine.body.data.find((e) => e.id === proposal.id)).toMatchObject({
          status: 'pending',
        });
        const other = await api('get', '/me/events/proposed', 'citizen2');
        expect(other.body.data.map((e) => e.id)).not.toContain(proposal.id);
        expect((await request(app).get('/api/v1/me/events/proposed')).status).toBe(401);
      });

      it('lists the moderation queue to staff only', async () => {
        const queue = await api('get', '/admin/events?status=pending&limit=50', 'authority');
        expect(queue.status).toBe(200);
        const found = queue.body.data.find((e) => e.id === proposal.id);
        expect(found).toMatchObject({
          status: 'pending',
          organizer: { full_name: `${MARK} citizen` },
        });
        expect((await api('get', '/admin/events?status=pending', 'citizen')).status).toBe(403);
        expect(JSON.stringify(queue.body)).not.toContain(people.citizen.email);
      });

      it('forbids users from moderating', async () => {
        const res = await api('patch', `/admin/events/${proposal.id}/moderation`, 'citizen').send({
          action: 'approve',
        });
        expect(res.status).toBe(403);
      });

      it('requires a reason to reject', async () => {
        const res = await api('patch', `/admin/events/${proposal.id}/moderation`, 'authority').send(
          {
            action: 'reject',
          },
        );
        expect(res.status).toBe(400);
      });

      it('rejects with a reason the proposer can read', async () => {
        const target = (
          await api('post', '/events', 'citizen').send(eventBody({ title: `${MARK} Rechazable` }))
        ).body.data;
        const res = await api('patch', `/admin/events/${target.id}/moderation`, 'authority').send({
          action: 'reject',
          reason: 'Ya existe un evento igual esa semana.',
        });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: 'rejected' });
        const mine = await api('get', '/me/events/proposed', 'citizen');
        expect(mine.body.data.find((e) => e.id === target.id)).toMatchObject({
          status: 'rejected',
          moderation_note: 'Ya existe un evento igual esa semana.',
        });
        expect((await request(app).get(`/api/v1/events/${target.id}`)).status).toBe(404);
        const again = await api('patch', `/admin/events/${target.id}/moderation`, 'authority').send(
          {
            action: 'approve',
          },
        );
        expect(again.status).toBe(409);
        expect(again.body.error.code).toBe('INVALID_TRANSITION');
      });

      it('approves it and the event becomes public', async () => {
        const res = await api('patch', `/admin/events/${proposal.id}/moderation`, 'authority').send(
          {
            action: 'approve',
          },
        );
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('published');
        const publicRes = await request(app).get(`/api/v1/events/${proposal.id}`);
        expect(publicRes.status).toBe(200);
        const list = await request(app).get('/api/v1/events?limit=50');
        expect(list.body.data.map((e) => e.id)).toContain(proposal.id);
        const mine = await api('get', '/me/events/proposed', 'citizen');
        expect(mine.body.data.find((e) => e.id === proposal.id).status).toBe('published');
        const row = await pool.query('SELECT moderated_by FROM events WHERE id = $1', [
          proposal.id,
        ]);
        expect(row.rows[0].moderated_by).toBe(people.authority.id);
      });

      it('cannot approve twice, but can cancel a published event', async () => {
        const twice = await api('patch', `/admin/events/${proposal.id}/moderation`, 'admin').send({
          action: 'approve',
        });
        expect(twice.status).toBe(409);
        const cancel = await api('patch', `/admin/events/${proposal.id}/moderation`, 'admin').send({
          action: 'cancel',
          reason: 'Se suspendió por mal clima.',
        });
        expect(cancel.status).toBe(200);
        expect(cancel.body.data.status).toBe('cancelled');
        expect((await request(app).get(`/api/v1/events/${proposal.id}`)).status).toBe(404);
      });

      it('answers 404 for an unknown event', async () => {
        const res = await api('patch', `/admin/events/${randomUUID()}/moderation`, 'admin').send({
          action: 'approve',
        });
        expect(res.status).toBe(404);
      });

      it('rate limits proposals per client', async () => {
        const limited = createApp({
          clientOrigin: CLIENT_ORIGIN,
          db: pool,
          rateLimitPerMinute: 100_000,
          admin: { proposalRateLimit: { windowMs: 60_000, limit: 2 } },
          auth: { jwtSecret: SECRET, bcryptRounds: 4, refreshTtlSeconds: 3600, mailer },
        });
        const statuses = [];
        for (let i = 0; i < 3; i += 1) {
          const res = await request(limited)
            .post('/api/v1/events')
            .set(as('citizen2'))
            .send(eventBody({ title: `${MARK} Límite ${i}` }));
          statuses.push(res.status);
        }
        expect(statuses).toEqual([201, 201, 429]);
      });
    });
  });

  describe('educational content', () => {
    const body = (overrides = {}) => ({
      title: `${MARK} Guía de avistamiento`,
      type: 'article',
      body: 'Mantén la distancia y apaga el flash.',
      category: 'fauna-marina',
      ...overrides,
    });
    let created;

    it('creates an unpublished article with a generated slug', async () => {
      const res = await api('post', '/admin/edu-contents', 'authority').send(body());
      expect(res.status).toBe(201);
      created = res.body.data;
      expect(created).toMatchObject({
        is_published: false,
        published_at: null,
        slug: `${MARK}-guia-de-avistamiento`,
        category: { slug: 'fauna-marina' },
      });
      const publicRes = await request(app).get('/api/v1/edu-contents?limit=50');
      expect(publicRes.body.data.map((c) => c.slug)).not.toContain(created.slug);
    });

    it('requires a URL for videos and links', async () => {
      const res = await api('post', '/admin/edu-contents', 'authority').send(
        body({ title: `${MARK} Video`, type: 'video' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('media_url');
      const ok = await api('post', '/admin/edu-contents', 'authority').send(
        body({
          title: `${MARK} Video`,
          type: 'video',
          media_url: 'https://www.youtube.com/watch?v=x',
        }),
      );
      expect(ok.status).toBe(201);
    });

    it('rejects a type change that would leave a video without URL', async () => {
      const res = await api('patch', `/admin/edu-contents/${created.id}`, 'authority').send({
        type: 'link',
      });
      expect(res.status).toBe(400);
    });

    it('publishes and unpublishes', async () => {
      const published = await api('patch', `/admin/edu-contents/${created.id}`, 'authority').send({
        is_published: true,
      });
      expect(published.body.data.is_published).toBe(true);
      const stamp = published.body.data.published_at;
      expect(stamp).not.toBeNull();
      const publicRes = await request(app).get('/api/v1/edu-contents?limit=50');
      expect(publicRes.body.data.map((c) => c.slug)).toContain(created.slug);

      const hidden = await api('patch', `/admin/edu-contents/${created.id}`, 'authority').send({
        is_published: false,
      });
      expect(hidden.body.data.is_published).toBe(false);
      const after = await request(app).get('/api/v1/edu-contents?limit=50');
      expect(after.body.data.map((c) => c.slug)).not.toContain(created.slug);

      const again = await api('patch', `/admin/edu-contents/${created.id}`, 'authority').send({
        is_published: true,
      });
      expect(again.body.data.published_at).toBe(stamp);
    });

    it('filters the staff list by published state', async () => {
      const drafts = await api(
        'get',
        `/admin/edu-contents?published=false&q=${encodeURIComponent(MARK)}&limit=50`,
        'authority',
      );
      expect(drafts.body.data.every((c) => c.is_published === false)).toBe(true);
      const live = await api(
        'get',
        `/admin/edu-contents?published=true&q=${encodeURIComponent(MARK)}&limit=50`,
        'authority',
      );
      expect(live.body.data.map((c) => c.id)).toContain(created.id);
    });

    it('rejects a duplicated explicit slug and unknown categories', async () => {
      const dup = await api('post', '/admin/edu-contents', 'admin').send(
        body({ title: `${MARK} Otro`, slug: created.slug }),
      );
      expect(dup.status).toBe(409);
      const cat = await api('post', '/admin/edu-contents', 'admin').send(
        body({ category: 'nada' }),
      );
      expect(cat.status).toBe(400);
    });

    it('soft-deletes and hides the content from the public API', async () => {
      expect((await api('delete', `/admin/edu-contents/${created.id}`, 'authority')).status).toBe(
        204,
      );
      const publicRes = await request(app).get('/api/v1/edu-contents?limit=50');
      expect(publicRes.body.data.map((c) => c.slug)).not.toContain(created.slug);
      expect((await api('get', `/admin/edu-contents/${created.id}`, 'authority')).status).toBe(404);
      const row = await pool.query('SELECT deleted_at FROM edu_contents WHERE id = $1', [
        created.id,
      ]);
      expect(row.rows[0].deleted_at).not.toBeNull();
    });

    it('is forbidden to plain users', async () => {
      expect((await api('post', '/admin/edu-contents', 'citizen').send(body())).status).toBe(403);
    });
  });

  describe('users (admin only)', () => {
    it('lists areas', async () => {
      const res = await api('get', '/admin/areas', 'admin');
      expect(res.body.data).toEqual(
        expect.arrayContaining([{ id: Number(areaId), name: `${MARK} area` }]),
      );
    });

    it('lists users with filters, search and pagination, never leaking credentials', async () => {
      const res = await api('get', `/admin/users?q=${encodeURIComponent(MARK)}&limit=50`, 'admin');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
      const text = JSON.stringify(res.body);
      for (const forbidden of ['password', 'token_hash', 'refresh']) {
        expect(text).not.toContain(forbidden);
      }
      const staff = await api(
        'get',
        `/admin/users?role=authority&q=${encodeURIComponent(MARK)}&limit=50`,
        'admin',
      );
      expect(staff.body.data.every((u) => u.role === 'authority')).toBe(true);
      expect(staff.body.data.find((u) => u.email === people.authority.email).area).toEqual({
        id: Number(areaId),
        name: `${MARK} area`,
      });
      const inactive = await api('get', `/admin/users?status=inactive&q=${MARK}`, 'admin');
      expect(inactive.body.data.every((u) => u.is_active === false)).toBe(true);
    });

    it('creates staff without any password in the response: an invitation goes by email', async () => {
      mailer.sendInvitation.mockClear();
      const email = `${MARK}-invited@example.com`;
      const res = await api('post', '/admin/users', 'admin').send({
        full_name: `${MARK} Invitada`,
        email,
        role: 'authority',
        area_id: Number(areaId),
      });
      expect(res.status).toBe(201);
      expect(res.body.meta.invitation_sent).toBe(true);
      expect(res.body.data).toMatchObject({ role: 'authority', is_active: true, email });
      expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
      expect(mailer.sendInvitation).toHaveBeenCalledTimes(1);
      const sent = mailer.sendInvitation.mock.calls[0][0];
      expect(sent).toMatchObject({ to: email, ttlHours: 48 });

      // The emailed token lets the person choose a password and sign in.
      const reset = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token: sent.token, password: 'ClaveNueva#2026' });
      expect(reset.status).toBe(200);
      const signIn = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'ClaveNueva#2026' });
      expect(signIn.status).toBe(200);
      expect(signIn.body.data.user.role).toBe('authority');
      // ...and nobody could sign in with the placeholder before that.
      const reuse = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token: sent.token, password: 'OtraClave#2026' });
      expect(reuse.status).toBe(400);
    });

    it('still creates the account when the email cannot be sent, and reports it', async () => {
      mailer.sendInvitation.mockRejectedValueOnce(new Error('smtp down'));
      const res = await api('post', '/admin/users', 'admin').send({
        full_name: `${MARK} Sin correo`,
        email: `${MARK}-nomail@example.com`,
        role: 'admin',
      });
      expect(res.status).toBe(201);
      expect(res.body.meta.invitation_sent).toBe(false);
      mailer.sendInvitation.mockClear();
      const resend = await api('post', `/admin/users/${res.body.data.id}/invitation`, 'admin');
      expect(resend.status).toBe(200);
      expect(resend.body.meta.invitation_sent).toBe(true);
      expect(mailer.sendInvitation).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate emails, unknown areas and the user role on creation', async () => {
      const dup = await api('post', '/admin/users', 'admin').send({
        full_name: 'Duplicada',
        email: people.citizen.email.toUpperCase(),
        role: 'authority',
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('EMAIL_TAKEN');
      const area = await api('post', '/admin/users', 'admin').send({
        full_name: 'Sin área',
        email: `${MARK}-area@example.com`,
        role: 'authority',
        area_id: 2_000_000_000,
      });
      expect(area.status).toBe(400);
      const role = await api('post', '/admin/users', 'admin').send({
        full_name: 'Usuario',
        email: `${MARK}-role@example.com`,
        role: 'user',
      });
      expect(role.status).toBe(400);
    });

    it('changes role and area', async () => {
      const res = await api('patch', `/admin/users/${people.citizen2.id}`, 'admin').send({
        role: 'authority',
        area_id: Number(areaId),
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        role: 'authority',
        area: { id: Number(areaId) },
      });
      await api('patch', `/admin/users/${people.citizen2.id}`, 'admin').send({
        role: 'user',
        area_id: null,
      });
    });

    it('deactivating a user revokes ALL their refresh tokens and blocks sign-in', async () => {
      const victim = await makeUser('victim', 'user');
      await login(victim.email);
      await login(victim.email);
      const live = () =>
        pool
          .query(
            'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
            [victim.id],
          )
          .then((r) => r.rows[0].n);
      expect(await live()).toBeGreaterThanOrEqual(3);
      const res = await api('patch', `/admin/users/${victim.id}`, 'admin').send({
        is_active: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);
      expect(await live()).toBe(0);
      const attempt = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: victim.email, password: PASSWORD });
      expect(attempt.status).toBe(401);
      const reactivated = await api('patch', `/admin/users/${victim.id}`, 'admin').send({
        is_active: true,
      });
      expect(reactivated.body.data.is_active).toBe(true);
    });

    it('does not let an admin remove their own admin role or deactivate themselves', async () => {
      for (const change of [{ role: 'user' }, { role: 'authority' }, { is_active: false }]) {
        const res = await api('patch', `/admin/users/${people.admin.id}`, 'admin').send(change);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SELF_PROTECTION');
      }
      const row = await pool.query('SELECT role, is_active FROM users WHERE id = $1', [
        people.admin.id,
      ]);
      expect(row.rows[0]).toEqual({ role: 'admin', is_active: true });
      const harmless = await api('patch', `/admin/users/${people.admin.id}`, 'admin').send({
        full_name: `${MARK} admin`,
      });
      expect(harmless.status).toBe(200);
    });

    it('lets one admin demote another while at least one stays active', async () => {
      const res = await api('patch', `/admin/users/${people.admin2.id}`, 'admin').send({
        role: 'authority',
      });
      expect(res.status).toBe(200);
      // The demoted admin lost the panel's admin routes at once, token still live.
      expect((await api('get', '/admin/users', 'admin2')).status).toBe(403);
    });

    it('answers 404 for an unknown user and validates the body', async () => {
      expect(
        (await api('patch', `/admin/users/${randomUUID()}`, 'admin').send({ is_active: false }))
          .status,
      ).toBe(404);
      expect(
        (await api('patch', `/admin/users/${people.citizen.id}`, 'admin').send({})).status,
      ).toBe(400);
      expect(
        (
          await api('patch', `/admin/users/${people.citizen.id}`, 'admin').send({
            password_hash: 'x',
          })
        ).status,
      ).toBe(400);
    });

    it('audits role changes without personal data', async () => {
      logLines.length = 0;
      await api('patch', `/admin/users/${people.citizen2.id}`, 'admin').send({ role: 'authority' });
      await api('patch', `/admin/users/${people.citizen2.id}`, 'admin').send({ role: 'user' });
      const logged = logLines.join('');
      expect(logged).toContain('"audit":"admin.user.updated"');
      expect(logged).toContain('"roleFrom":"user"');
      expect(logged).not.toContain(people.citizen2.email);
    });
  });
});
