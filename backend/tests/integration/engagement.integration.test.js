import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const CLIENT_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Segura#2026';
const RUN = randomUUID().slice(0, 8);

// Requires a migrated and seeded PostgreSQL (see README). Skipped without DATABASE_URL.
// Works on its own destination and events so the seeded catalog counters stay untouched.
describe.skipIf(!process.env.DATABASE_URL)('engagement API (PostgreSQL)', () => {
  let pool;
  let app;
  let slug;
  let destinationId;
  let upcomingEventId;
  let pastEventId;
  let pendingEventId;

  const register = async (label) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        full_name: `Tester ${label}`,
        email: `itest-eng-${RUN}-${label}@example.com`,
        password: PASSWORD,
      });
    expect(res.status).toBe(201);
    return { id: res.body.data.user.id, auth: `Bearer ${res.body.data.access_token}` };
  };

  const counters = async () =>
    (
      await pool.query(
        'SELECT avg_rating::float8 AS avg_rating, reviews_count, favorites_count FROM destinations WHERE id = $1',
        [destinationId],
      )
    ).rows[0];

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL);
    app = createApp({
      clientOrigin: CLIENT_ORIGIN,
      db: pool,
      rateLimitPerMinute: 10_000,
      auth: {
        jwtSecret: SECRET,
        bcryptRounds: 4,
        refreshTtlSeconds: 3600,
        cookieSecure: true,
        rateLimit: { windowMs: 60_000, limit: 10_000 },
        mailer: { sendPasswordReset: async () => {} },
      },
    });
    slug = `itest-eng-${RUN}`;
    const dest = await pool.query(
      `INSERT INTO destinations (slug, name, summary, category_id, location, status)
       VALUES ($1, 'Destino de prueba', 'Resumen', (SELECT id FROM destination_categories LIMIT 1),
         ST_SetSRID(ST_MakePoint(-110.3, 24.1), 4326)::geography, 'published')
       RETURNING id`,
      [slug],
    );
    destinationId = dest.rows[0].id;
    const insertEvent = async (title, startsExpr, endsExpr, status = 'published') =>
      (
        await pool.query(
          `INSERT INTO events (title, starts_at, ends_at, status)
           VALUES ($1, ${startsExpr}, ${endsExpr}, $2) RETURNING id`,
          [`itest-eng-${RUN} ${title}`, status],
        )
      ).rows[0].id;
    upcomingEventId = await insertEvent(
      'futuro',
      "now() + interval '3 days'",
      "now() + interval '3 days 2 hours'",
    );
    pastEventId = await insertEvent(
      'pasado',
      "now() - interval '3 days'",
      "now() - interval '3 days' + interval '1 hour'",
    );
    pendingEventId = await insertEvent('pendiente', "now() + interval '5 days'", 'NULL', 'pending');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE title LIKE $1`, [`itest-eng-${RUN}%`]);
    await pool.query('DELETE FROM destinations WHERE id = $1', [destinationId]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`itest-eng-${RUN}-%`]);
    await pool.end();
  });

  describe('reviews', () => {
    it('keeps rating and count consistent through create, duplicate, upsert and concurrent writers', async () => {
      const ana = await register('ana');
      const created = await request(app)
        .post(`/api/v1/destinations/${slug}/reviews`)
        .set('Authorization', ana.auth)
        .send({ rating: 4, comment: '  Muy bonita  ' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ rating: 4, comment: 'Muy bonita' });
      expect(created.body.meta).toEqual({ avg_rating: 4, reviews_count: 1 });

      const duplicate = await request(app)
        .post(`/api/v1/destinations/${slug}/reviews`)
        .set('Authorization', ana.auth)
        .send({ rating: 1 });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('REVIEW_EXISTS');
      expect(await counters()).toMatchObject({ avg_rating: 4, reviews_count: 1 });

      const replaced = await request(app)
        .put(`/api/v1/destinations/${slug}/reviews/me`)
        .set('Authorization', ana.auth)
        .send({ rating: 2 });
      expect(replaced.status).toBe(200);
      expect(replaced.body.meta).toEqual({ avg_rating: 2, reviews_count: 1 });

      const bea = await register('bea');
      const upserted = await request(app)
        .put(`/api/v1/destinations/${slug}/reviews/me`)
        .set('Authorization', bea.auth)
        .send({ rating: 5, comment: null });
      expect(upserted.status).toBe(201);
      expect(upserted.body.meta).toEqual({ avg_rating: 3.5, reviews_count: 2 });

      const users = await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(register));
      const ratings = [1, 2, 3, 4, 5, 5];
      const results = await Promise.all(
        users.map((user, index) =>
          request(app)
            .post(`/api/v1/destinations/${slug}/reviews`)
            .set('Authorization', user.auth)
            .send({ rating: ratings[index] }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
      const expectedAvg =
        Math.round(((2 + 5 + ratings.reduce((a, b) => a + b, 0)) / 8) * 100) / 100;
      expect(await counters()).toMatchObject({ reviews_count: 8, avg_rating: expectedAvg });
    });

    it('lists reviews publicly without any author data and paginates', async () => {
      const res = await request(app).get(`/api/v1/destinations/${slug}/reviews?limit=5`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toMatchObject({ total: 8, limit: 5, total_pages: 2 });
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/user_id|full_name|email|Tester/);
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'comment',
        'created_at',
        'id',
        'rating',
        'updated_at',
      ]);
      expect(res.headers['cache-control']).toMatch(/public/);
      expect(res.headers.etag).toBeTruthy();
    });

    it('answers 304 to a matching If-None-Match', async () => {
      const first = await request(app).get(`/api/v1/destinations/${slug}`);
      const second = await request(app)
        .get(`/api/v1/destinations/${slug}`)
        .set('If-None-Match', first.headers.etag);
      expect(second.status).toBe(304);
    });

    it('rejects anonymous writes and unknown destinations', async () => {
      const anonymous = await request(app)
        .post(`/api/v1/destinations/${slug}/reviews`)
        .send({ rating: 3 });
      expect(anonymous.status).toBe(401);
      const dan = await register('dan');
      const missing = await request(app)
        .post('/api/v1/destinations/no-existe-jamas/reviews')
        .set('Authorization', dan.auth)
        .send({ rating: 3 });
      expect(missing.status).toBe(404);
    });

    it('lists my reviews with their destination', async () => {
      const ana = await register('mine');
      await request(app)
        .post(`/api/v1/destinations/${slug}/reviews`)
        .set('Authorization', ana.auth)
        .send({ rating: 5, comment: 'Mía' });
      const res = await request(app).get('/api/v1/me/reviews').set('Authorization', ana.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        rating: 5,
        comment: 'Mía',
        destination: { slug, name: 'Destino de prueba' },
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('favorites', () => {
    it('is idempotent and only moves favorites_count when the row really changes', async () => {
      const eva = await register('eva');
      const base = (await counters()).favorites_count;
      const put = () =>
        request(app).put(`/api/v1/me/favorites/${slug}`).set('Authorization', eva.auth);
      const first = await put();
      expect(first.body).toEqual({
        data: { slug, favorited: true, changed: true },
        meta: { favorites_count: base + 1 },
      });
      const second = await put();
      expect(second.body.data.changed).toBe(false);
      expect(second.body.meta.favorites_count).toBe(base + 1);

      const list = await request(app).get('/api/v1/me/favorites').set('Authorization', eva.auth);
      expect(list.body.data.map((d) => d.slug)).toEqual([slug]);
      expect(list.body.data[0]).toHaveProperty('favorited_at');

      const del = await request(app)
        .delete(`/api/v1/me/favorites/${slug}`)
        .set('Authorization', eva.auth);
      expect(del.body.meta.favorites_count).toBe(base);
      const again = await request(app)
        .delete(`/api/v1/me/favorites/${slug}`)
        .set('Authorization', eva.auth);
      expect(again.body.data.changed).toBe(false);
      expect(again.body.meta.favorites_count).toBe(base);
      expect((await counters()).favorites_count).toBe(base);
    });

    it('stays consistent under concurrent favorites from many users and repeated calls', async () => {
      const users = await Promise.all(['f1', 'f2', 'f3', 'f4', 'f5'].map(register));
      const before = (await counters()).favorites_count;
      await Promise.all(
        users.flatMap((user) =>
          [1, 2].map(() =>
            request(app).put(`/api/v1/me/favorites/${slug}`).set('Authorization', user.auth),
          ),
        ),
      );
      const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM favorites WHERE destination_id = $1',
        [destinationId],
      );
      expect((await counters()).favorites_count).toBe(rows[0].n);
      expect(rows[0].n).toBe(before + 5);
    });

    it('requires a session and a published destination', async () => {
      expect((await request(app).put(`/api/v1/me/favorites/${slug}`)).status).toBe(401);
      const gus = await register('gus');
      const res = await request(app)
        .put('/api/v1/me/favorites/no-existe-jamas')
        .set('Authorization', gus.auth);
      expect(res.status).toBe(404);
    });
  });

  describe('events', () => {
    it('shows attending only with a session and varies the cache accordingly', async () => {
      const hana = await register('hana');
      const anonymous = await request(app).get(`/api/v1/events/${upcomingEventId}`);
      expect(anonymous.status).toBe(200);
      expect(anonymous.body.data).not.toHaveProperty('attending');
      expect(anonymous.body.data.attendees_count).toBe(0);
      expect(anonymous.headers['cache-control']).toMatch(/public/);

      const put = await request(app)
        .put(`/api/v1/events/${upcomingEventId}/attendance`)
        .set('Authorization', hana.auth);
      expect(put.status).toBe(200);
      expect(put.body).toEqual({
        data: { event_id: upcomingEventId, attending: true },
        meta: { attendees_count: 1 },
      });
      const repeat = await request(app)
        .put(`/api/v1/events/${upcomingEventId}/attendance`)
        .set('Authorization', hana.auth);
      expect(repeat.body.meta.attendees_count).toBe(1);

      const mine = await request(app)
        .get(`/api/v1/events/${upcomingEventId}`)
        .set('Authorization', hana.auth);
      expect(mine.body.data.attending).toBe(true);
      expect(mine.headers['cache-control']).toBe('private, no-store');

      const list = await request(app)
        .get('/api/v1/events?limit=50')
        .set('Authorization', hana.auth);
      const found = list.body.data.find((e) => e.id === upcomingEventId);
      expect(found).toMatchObject({ attending: true, attendees_count: 1 });
      expect(list.body.data.every((e) => typeof e.attending === 'boolean')).toBe(true);

      const myEvents = await request(app).get('/api/v1/me/events').set('Authorization', hana.auth);
      expect(myEvents.body.data.map((e) => e.id)).toEqual([upcomingEventId]);

      const del = await request(app)
        .delete(`/api/v1/events/${upcomingEventId}/attendance`)
        .set('Authorization', hana.auth);
      expect(del.body).toEqual({
        data: { event_id: upcomingEventId, attending: false },
        meta: { attendees_count: 0 },
      });
    });

    it('refuses attendance to finished, unpublished and unknown events', async () => {
      const ivan = await register('ivan');
      const attend = (id) =>
        request(app).put(`/api/v1/events/${id}/attendance`).set('Authorization', ivan.auth);
      const past = await attend(pastEventId);
      expect(past.status).toBe(409);
      expect(past.body.error.code).toBe('EVENT_NOT_OPEN');
      expect((await attend(pendingEventId)).status).toBe(404);
      expect((await attend(randomUUID())).status).toBe(404);
      expect((await request(app).get(`/api/v1/events/${pendingEventId}`)).status).toBe(404);
    });

    it('serves a finished event by id (shared links keep working) but not in the upcoming list', async () => {
      const detail = await request(app).get(`/api/v1/events/${pastEventId}`);
      expect(detail.status).toBe(200);
      const list = await request(app).get('/api/v1/events?limit=50');
      expect(list.body.data.some((e) => e.id === pastEventId)).toBe(false);
    });

    it('requires a session to attend', async () => {
      const res = await request(app).put(`/api/v1/events/${upcomingEventId}/attendance`);
      expect(res.status).toBe(401);
    });
  });
});
