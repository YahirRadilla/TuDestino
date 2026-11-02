import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';
import { DEV_VAPID_KEYS } from '../../src/config/env.js';
import { createNotifier } from '../../src/services/notify.js';
import { createReminderScheduler, runReminderPass } from '../../src/services/reminders.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const CLIENT_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Segura#2026';
const RUN = randomUUID().slice(0, 8);
const MARK = `itest-push-${RUN}`;
const P256DH = 'B'.repeat(87);
const HOUR = 3_600_000;

const endpointOf = (label) => `https://push.itest.example/${RUN}/${label}`;
const authOf = (label) => `auth-${RUN}-${label}`.padEnd(22, 'x');
const subscriptionBody = (label, extra = {}) => ({
  endpoint: endpointOf(label),
  keys: { p256dh: P256DH, auth: authOf(label) },
  ...extra,
});

// Requires a migrated PostgreSQL (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('Web Push, follow-ups and inbox (PostgreSQL)', () => {
  let pool;
  let app;
  let notifier;
  let sendNotification;
  const people = {};
  const reportUuids = [];

  const api = (method, url, who) => {
    const req = request(app)[method](`/api/v1${url}`);
    return who ? req.set('Authorization', people[who].bearer) : req;
  };

  const sentTo = (label) =>
    sendNotification.mock.calls.filter(([target]) => target.endpoint === endpointOf(label));

  const login = async (email) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return `Bearer ${res.body.data.access_token}`;
  };

  const makeUser = async (label, role) => {
    const email = `${MARK}-${label}@example.com`;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARK} ${label}`, email, hash, role],
    );
    people[label] = { id: rows[0].id, bearer: await login(email) };
  };

  const createReport = async ({ who } = {}) => {
    const uuid = randomUUID();
    reportUuids.push(uuid);
    let req = request(app)
      .post('/api/v1/reports')
      .field('type', 'contaminacion')
      .field('description', `${MARK} Basura acumulada en la orilla de la playa.`)
      .field('lat', '24.1426')
      .field('lng', '-110.3128')
      .field('client_uuid', uuid);
    if (who) req = req.set('Authorization', people[who].bearer).field('anonymous', 'false');
    const res = await req;
    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT id FROM reports WHERE folio = $1', [
      res.body.data.folio,
    ]);
    return { ...res.body.data, id: rows[0].id };
  };

  const subscribe = (label, who) => {
    const req = api('post', '/push/subscriptions', who).send(subscriptionBody(label));
    return req;
  };

  const makeEvent = async ({ status = 'published', startsAt, organizer = null } = {}) => {
    const { rows } = await pool.query(
      `INSERT INTO events (title, starts_at, status, organizer_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARK} Limpieza`, startsAt ?? new Date(Date.now() + 5 * 24 * HOUR), status, organizer],
    );
    return rows[0].id;
  };

  const inboxOf = async (label) =>
    (
      await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id', [
        people[label].id,
      ])
    ).rows;

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL);
    sendNotification = vi.fn(async () => ({ statusCode: 201 }));
    notifier = createNotifier({
      db: pool,
      vapid: DEV_VAPID_KEYS,
      webPush: { sendNotification: (...args) => sendNotification(...args) },
    });
    app = createApp({
      clientOrigin: CLIENT_ORIGIN,
      db: pool,
      rateLimitPerMinute: 100_000,
      push: {
        vapid: DEV_VAPID_KEYS,
        notifier,
        rateLimit: { windowMs: 60_000, limit: 100_000 },
      },
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
        mailer: { sendPasswordReset: async () => {} },
      },
      reports: {
        rateLimit: { windowMs: 60_000, limit: 100_000 },
        trackRateLimit: { windowMs: 60_000, limit: 100_000 },
      },
    });
    await makeUser('citizen', 'user');
    await makeUser('citizen2', 'user');
    await makeUser('authority', 'authority');
  });

  afterAll(async () => {
    await notifier.idle();
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
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint LIKE $1', [
      `https://push.itest.example/${RUN}/%`,
    ]);
    await pool.query('DELETE FROM events WHERE title LIKE $1', [`${MARK}%`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`${MARK}-%`]);
    await pool.end();
  });

  describe('public key and subscriptions', () => {
    it('publishes the VAPID public key without authentication', async () => {
      const res = await api('get', '/push/public-key');
      expect(res.status).toBe(200);
      expect(res.body.data.public_key).toBe(DEV_VAPID_KEYS.publicKey);
      expect(res.body.data.private_key).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(DEV_VAPID_KEYS.privateKey);
    });

    it('stores a subscription once and is idempotent per endpoint', async () => {
      const first = await subscribe('idem');
      expect(first.status).toBe(201);
      const second = await subscribe('idem');
      expect(second.status).toBe(200);
      const { rows } = await pool.query(
        'SELECT user_id FROM push_subscriptions WHERE endpoint = $1',
        [endpointOf('idem')],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBeNull();
    });

    it('links the device to the session and detaches it when re-registered signed out', async () => {
      await subscribe('owned', 'citizen');
      const read = async () =>
        (
          await pool.query('SELECT user_id FROM push_subscriptions WHERE endpoint = $1', [
            endpointOf('owned'),
          ])
        ).rows[0].user_id;
      expect(await read()).toBe(people.citizen.id);
      await subscribe('owned');
      expect(await read()).toBeNull();
    });

    it('refreshes the keys when the browser rotates them', async () => {
      await subscribe('rotate');
      const res = await api('post', '/push/subscriptions').send({
        endpoint: endpointOf('rotate'),
        keys: { p256dh: P256DH, auth: 'z'.repeat(22) },
      });
      expect(res.status).toBe(200);
      const { rows } = await pool.query('SELECT auth FROM push_subscriptions WHERE endpoint = $1', [
        endpointOf('rotate'),
      ]);
      expect(rows[0].auth).toBe('z'.repeat(22));
    });

    it.each([
      ['an http endpoint', { endpoint: 'http://push.itest.example/x' }],
      ['unknown fields', { user_id: people?.citizen?.id ?? 'x' }],
      ['an oversized endpoint', { endpoint: `https://push.itest.example/${'a'.repeat(1100)}` }],
    ])('rejects %s', async (_label, extra) => {
      const res = await api('post', '/push/subscriptions').send({
        ...subscriptionBody('bad'),
        ...extra,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores a forged bearer token instead of failing (public endpoint)', async () => {
      const res = await api('post', '/push/subscriptions')
        .set('Authorization', 'Bearer not.a.token')
        .send(subscriptionBody('forged'));
      expect(res.status).toBe(201);
    });
  });

  describe('unsubscribe requires proof of possession', () => {
    it('does not delete with a wrong auth secret and answers like an unknown endpoint', async () => {
      await subscribe('bye');
      const wrong = await api('delete', '/push/subscriptions').send({
        endpoint: endpointOf('bye'),
        auth: 'w'.repeat(22),
      });
      const unknown = await api('delete', '/push/subscriptions').send({
        endpoint: endpointOf('never-existed'),
        auth: authOf('bye'),
      });
      expect(wrong.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(wrong.body).toEqual(unknown.body);
      const { rowCount } = await pool.query(
        'SELECT 1 FROM push_subscriptions WHERE endpoint = $1',
        [endpointOf('bye')],
      );
      expect(rowCount).toBe(1);
    });

    it('requires the auth field', async () => {
      const res = await api('delete', '/push/subscriptions').send({ endpoint: endpointOf('bye') });
      expect(res.status).toBe(400);
    });

    it('deletes with the right secret', async () => {
      const res = await api('delete', '/push/subscriptions').send({
        endpoint: endpointOf('bye'),
        auth: authOf('bye'),
      });
      expect(res.status).toBe(204);
      const { rowCount } = await pool.query(
        'SELECT 1 FROM push_subscriptions WHERE endpoint = $1',
        [endpointOf('bye')],
      );
      expect(rowCount).toBe(0);
    });
  });

  describe('anonymous report follow-up', () => {
    it('follows with a valid folio + code, idempotently, without linking any identity', async () => {
      const report = await createReport();
      await subscribe('fol1');
      const body = {
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('fol1'),
      };
      expect((await api('post', '/reports/follow').send(body)).status).toBe(200);
      expect((await api('post', '/reports/follow').send(body)).status).toBe(200);
      const { rows } = await pool.query(
        `SELECT f.report_id, s.user_id FROM report_followers f
         JOIN push_subscriptions s ON s.id = f.subscription_id WHERE f.report_id = $1`,
        [report.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBeNull();
    });

    it('answers the same generic 404 for a wrong code and for an unknown folio', async () => {
      const report = await createReport();
      await subscribe('fol2');
      const wrongCode = await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: 'ZZZZZZZZZZ',
        endpoint: endpointOf('fol2'),
      });
      const unknownFolio = await api('post', '/reports/follow').send({
        folio: 'TD-2026-999999',
        tracking_code: report.tracking_code,
        endpoint: endpointOf('fol2'),
      });
      expect(wrongCode.status).toBe(404);
      expect(unknownFolio.status).toBe(404);
      expect(wrongCode.body).toEqual(unknownFolio.body);
      expect(wrongCode.body.error.code).toBe('REPORT_NOT_FOUND');
      const { rowCount } = await pool.query('SELECT 1 FROM report_followers WHERE report_id = $1', [
        report.id,
      ]);
      expect(rowCount).toBe(0);
    });

    it('asks to enable notifications first when the device has no subscription', async () => {
      const report = await createReport();
      const res = await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('not-subscribed'),
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    it('stops following with the same proof', async () => {
      const report = await createReport();
      await subscribe('fol3');
      const body = {
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('fol3'),
      };
      await api('post', '/reports/follow').send(body);
      expect(
        (await api('delete', '/reports/follow').send({ ...body, tracking_code: 'ZZZZZZZZZZ' }))
          .status,
      ).toBe(404);
      expect((await api('delete', '/reports/follow').send(body)).status).toBe(204);
      const { rowCount } = await pool.query('SELECT 1 FROM report_followers WHERE report_id = $1', [
        report.id,
      ]);
      expect(rowCount).toBe(0);
    });
  });

  describe('status change notifications', () => {
    it('pushes to followers without the internal note and without blocking the reply', async () => {
      const report = await createReport();
      await subscribe('fol4');
      await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('fol4'),
      });
      // A push service that never answers must not delay the HTTP response.
      sendNotification.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 1500)),
      );
      const started = Date.now();
      const res = await api('patch', `/admin/reports/${report.id}/status`, 'authority').send({
        status: 'in_review',
        note: 'NOTA-INTERNA-SECRETA con datos del denunciante',
      });
      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(3000);
      await vi.waitFor(() => expect(sentTo('fol4')).toHaveLength(1));
      await notifier.idle();
      const [target, body, options] = sentTo('fol4')[0];
      const payload = JSON.parse(body);
      expect(target.keys.auth).toBe(authOf('fol4'));
      expect(payload.title).toContain(report.folio);
      expect(payload.body).toContain('en revisión');
      expect(payload.url).toBe(`/seguimiento?folio=${report.folio}`);
      expect(body).not.toContain('NOTA-INTERNA');
      expect(body).not.toContain(report.tracking_code);
      expect(options.vapidDetails.subject).toBe(DEV_VAPID_KEYS.subject);
      expect(options.TTL).toBeGreaterThan(0);
    });

    it('creates an inbox row and pushes with the unread count for a reporter with an account', async () => {
      await subscribe('acct', 'citizen');
      const report = await createReport({ who: 'citizen' });
      const before = (await inboxOf('citizen')).length;
      const res = await api('patch', `/admin/reports/${report.id}/status`, 'authority').send({
        status: 'in_review',
        note: 'Revisando',
      });
      expect(res.status).toBe(200);
      await notifier.idle();
      const rows = await inboxOf('citizen');
      expect(rows).toHaveLength(before + 1);
      expect(rows.at(-1)).toMatchObject({ type: 'report_status', read_at: null });
      expect(rows.at(-1).title).toContain(report.folio);
      expect(rows.at(-1).body).not.toContain('Revisando');
      const payload = JSON.parse(sentTo('acct').at(-1)[1]);
      expect(payload.badge).toBeGreaterThanOrEqual(1);
    });

    it('does not notify twice when the account device also follows the report', async () => {
      await subscribe('dup', 'citizen2');
      const report = await createReport({ who: 'citizen2' });
      await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('dup'),
      });
      await api('patch', `/admin/reports/${report.id}/status`, 'authority').send({
        status: 'dismissed',
        note: 'No procede',
      });
      await notifier.idle();
      expect(sentTo('dup')).toHaveLength(1);
    });

    it('deletes a subscription the push service reports as gone (410)', async () => {
      const report = await createReport();
      await subscribe('gone');
      await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('gone'),
      });
      sendNotification.mockImplementationOnce(async () => {
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      });
      await api('patch', `/admin/reports/${report.id}/status`, 'authority').send({
        status: 'in_review',
        note: 'Revisando',
      });
      await notifier.idle();
      const { rowCount } = await pool.query(
        'SELECT 1 FROM push_subscriptions WHERE endpoint = $1',
        [endpointOf('gone')],
      );
      expect(rowCount).toBe(0);
    });

    it('still answers the status change when the push fails', async () => {
      const report = await createReport();
      await subscribe('flaky');
      await api('post', '/reports/follow').send({
        folio: report.folio,
        tracking_code: report.tracking_code,
        endpoint: endpointOf('flaky'),
      });
      sendNotification.mockImplementationOnce(async () => {
        throw Object.assign(new Error('upstream'), { statusCode: 503 });
      });
      const res = await api('patch', `/admin/reports/${report.id}/status`, 'authority').send({
        status: 'in_review',
        note: 'Revisando',
      });
      expect(res.status).toBe(200);
      await notifier.idle();
      const { rowCount } = await pool.query(
        'SELECT 1 FROM push_subscriptions WHERE endpoint = $1',
        [endpointOf('flaky')],
      );
      expect(rowCount).toBe(1); // transient errors keep the subscription
    });
  });

  describe('event notifications', () => {
    it('tells the proposer when staff approve or reject, and attendees when cancelled', async () => {
      const approved = await makeEvent({ status: 'pending', organizer: people.citizen.id });
      const rejected = await makeEvent({ status: 'pending', organizer: people.citizen.id });
      const cancelled = await makeEvent({ status: 'published', organizer: people.authority.id });
      await pool.query(
        'INSERT INTO event_attendances (user_id, event_id) VALUES ($1, $3), ($2, $3)',
        [people.citizen.id, people.citizen2.id, cancelled],
      );
      const base = (await inboxOf('citizen')).length;
      const base2 = (await inboxOf('citizen2')).length;

      for (const [id, action] of [
        [approved, 'approve'],
        [rejected, 'reject'],
        [cancelled, 'cancel'],
      ]) {
        const res = await api('patch', `/admin/events/${id}/moderation`, 'authority').send({
          action,
          reason: 'Motivo interno',
        });
        expect(res.status).toBe(200);
      }
      await notifier.idle();

      const mine = (await inboxOf('citizen')).slice(base);
      expect(mine.map((row) => row.type)).toEqual([
        'event_approved',
        'event_rejected',
        'event_cancelled',
      ]);
      expect(mine[0].url).toBe(`/eventos/${approved}`);
      expect(mine.every((row) => !row.body.includes('Motivo interno'))).toBe(true);
      const theirs = (await inboxOf('citizen2')).slice(base2);
      expect(theirs.map((row) => row.type)).toEqual(['event_cancelled']);
    });
  });

  describe('inbox', () => {
    it('requires a session', async () => {
      expect((await api('get', '/me/notifications')).status).toBe(401);
      expect((await api('post', '/me/notifications/read-all')).status).toBe(401);
      expect((await api('patch', '/me/notifications/1/read')).status).toBe(401);
    });

    it('lists only my notifications with the unread count, newest first, never cacheable', async () => {
      const a = await pool.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'x', 'A-${RUN}') RETURNING id`,
        [people.citizen2.id],
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'x', 'B-${RUN}')`,
        [people.citizen2.id],
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'x', 'C-${RUN}')`,
        [people.citizen.id],
      );
      const res = await api('get', '/me/notifications?limit=50', 'citizen2');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const titles = res.body.data.map((item) => item.title);
      expect(titles).toContain(`B-${RUN}`);
      expect(titles.indexOf(`B-${RUN}`)).toBeLessThan(titles.indexOf(`A-${RUN}`));
      expect(titles).not.toContain(`C-${RUN}`);
      const unread = res.body.data.filter((item) => !item.read).length;
      expect(res.body.unread_count).toBe(unread);
      expect(res.body.meta).toMatchObject({ page: 1 });
      expect(typeof res.body.data[0].id).toBe('number');
      expect(res.body.data[0].read).toBe(false);
      expect(a.rows[0].id).toBeDefined();
    });

    it('marks one as read and updates the count; another user gets a 404', async () => {
      const { rows } = await pool.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'x', 'R-${RUN}') RETURNING id`,
        [people.citizen2.id],
      );
      const id = rows[0].id;
      const other = await api('patch', `/me/notifications/${id}/read`, 'citizen');
      expect(other.status).toBe(404);
      const before = (await api('get', '/me/notifications', 'citizen2')).body.unread_count;
      const res = await api('patch', `/me/notifications/${id}/read`, 'citizen2');
      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);
      expect(res.body.unread_count).toBe(before - 1);
      // idempotent
      expect((await api('patch', `/me/notifications/${id}/read`, 'citizen2')).status).toBe(200);
      expect((await api('patch', '/me/notifications/abc/read', 'citizen2')).status).toBe(400);
      expect((await api('patch', '/me/notifications/999999999/read', 'citizen2')).status).toBe(404);
    });

    it('filters unread ones and marks everything as read without touching other users', async () => {
      const list = await api('get', '/me/notifications?unread=true', 'citizen2');
      expect(list.body.data.every((item) => !item.read)).toBe(true);
      const res = await api('post', '/me/notifications/read-all', 'citizen2');
      expect(res.status).toBe(200);
      expect(res.body.unread_count).toBe(0);
      expect((await api('get', '/me/notifications', 'citizen2')).body.unread_count).toBe(0);
      expect((await api('get', '/me/notifications', 'citizen')).body.unread_count).toBeGreaterThan(
        0,
      );
    });
  });

  describe('event reminders', () => {
    const NOW = new Date('2040-03-10T12:00:00Z');
    const at = (hours) => new Date(NOW.getTime() + hours * HOUR);

    it('reminds attendees of events starting within 24 h exactly once', async () => {
      const soon = await makeEvent({ startsAt: at(10), status: 'published' });
      const later = await makeEvent({ startsAt: at(30), status: 'published' });
      const pending = await makeEvent({ startsAt: at(8), status: 'pending' });
      const past = await makeEvent({ startsAt: at(-2), status: 'published' });
      for (const event of [soon, later, pending, past]) {
        await pool.query('INSERT INTO event_attendances (user_id, event_id) VALUES ($1, $2)', [
          people.citizen.id,
          event,
        ]);
      }
      await subscribe('rem', 'citizen');
      const base = (await inboxOf('citizen')).length;

      const first = await runReminderPass({ db: pool, notifier, now: NOW });
      expect(first).toEqual({ skipped: false, claimed: 1 });
      const rows = (await inboxOf('citizen')).slice(base);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'event_reminder', url: `/eventos/${soon}` });
      await vi.waitFor(() => expect(sentTo('rem').length).toBeGreaterThan(0));

      const second = await runReminderPass({ db: pool, notifier, now: NOW });
      expect(second.claimed).toBe(0);
      expect((await inboxOf('citizen')).slice(base)).toHaveLength(1);

      // Two minutes later the event is still inside the window and is not reminded again.
      const third = await runReminderPass({
        db: pool,
        notifier,
        now: new Date(NOW.getTime() + 120_000),
      });
      expect(third.claimed).toBe(0);

      // The 30 h event enters the window later and is then reminded once.
      const next = await runReminderPass({ db: pool, notifier, now: at(8) });
      expect(next.claimed).toBe(1);
      expect((await inboxOf('citizen')).slice(base).map((row) => row.url)).toContain(
        `/eventos/${later}`,
      );
    });

    it('never runs two passes at once across instances', async () => {
      const holder = await pool.connect();
      try {
        await holder.query('SELECT pg_advisory_lock($1)', [7_201_810_001]);
        const skipped = await runReminderPass({ db: pool, notifier, now: at(500_000) });
        expect(skipped).toEqual({ skipped: true, claimed: 0 });
      } finally {
        await holder.query('SELECT pg_advisory_unlock($1)', [7_201_810_001]);
        holder.release();
      }
    });

    it('the scheduler ticks, survives failures and stops cleanly', async () => {
      const runPass = vi
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({ skipped: false, claimed: 0 });
      const logger = { info: vi.fn(), error: vi.fn() };
      const scheduler = createReminderScheduler({
        db: pool,
        notifier,
        logger,
        intervalMs: 20,
        runPass,
      });
      scheduler.start();
      await vi.waitFor(() => expect(runPass.mock.calls.length).toBeGreaterThanOrEqual(3));
      await scheduler.stop();
      const calls = runPass.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(runPass.mock.calls.length).toBe(calls);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
