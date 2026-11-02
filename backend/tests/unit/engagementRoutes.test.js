import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { bearerFor, createAuthedApp, USER_ID } from '../helpers/authApp.js';
import { createFakeDb, rows } from '../helpers/fakeDb.js';

const SLUG = 'playa-balandra';
const DESTINATION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10';
const reviewRow = {
  id: '22222222-2222-4222-8222-222222222222',
  rating: 4,
  comment: 'Hermosa',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};
const lockedDestination = ['FOR UPDATE', rows({ id: DESTINATION_ID })];
const ratingTotals = [
  'UPDATE destinations d SET avg_rating',
  rows({ avg_rating: 4, reviews_count: 1 }),
];

describe('authentication and validation', () => {
  const guarded = [
    ['post', `/api/v1/destinations/${SLUG}/reviews`],
    ['put', `/api/v1/destinations/${SLUG}/reviews/me`],
    ['get', '/api/v1/me/favorites'],
    ['put', `/api/v1/me/favorites/${SLUG}`],
    ['delete', `/api/v1/me/favorites/${SLUG}`],
    ['get', '/api/v1/me/reviews'],
    ['get', '/api/v1/me/events'],
    ['put', `/api/v1/events/${EVENT_ID}/attendance`],
    ['delete', `/api/v1/events/${EVENT_ID}/attendance`],
  ];

  it.each(guarded)(
    '%s %s answers 401 without a session and never touches the database',
    async (method, path) => {
      const db = createFakeDb();
      const res = await request(createAuthedApp(db))[method](path).send({ rating: 5 });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(db.log).toHaveLength(0);
    },
  );

  it('rejects out-of-range ratings, unknown keys and bad identifiers with 400', async () => {
    const db = createFakeDb();
    const app = createAuthedApp(db);
    const auth = await bearerFor();
    const post = (body) =>
      request(app)
        .post(`/api/v1/destinations/${SLUG}/reviews`)
        .set('Authorization', auth)
        .send(body);
    expect((await post({ rating: 6 })).status).toBe(400);
    expect((await post({ rating: 5, user_id: 'x' })).status).toBe(400);
    const badEvent = await request(app)
      .put('/api/v1/events/not-a-uuid/attendance')
      .set('Authorization', auth);
    expect(badEvent.status).toBe(400);
    expect(db.log).toHaveLength(0);
  });
});

describe('reviews', () => {
  it('lists public reviews without author or user_id', async () => {
    const db = createFakeDb([
      ['SELECT id FROM destinations WHERE slug', rows({ id: DESTINATION_ID })],
      ['FROM reviews r', rows(reviewRow)],
      ['count(*)::int AS total', rows({ total: 1 })],
    ]);
    const res = await request(createAuthedApp(db)).get(`/api/v1/destinations/${SLUG}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([reviewRow]);
    expect(JSON.stringify(res.body)).not.toMatch(/user_id|author|full_name/);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(db.statements().join(' ')).not.toMatch(/user_id AS|r\.user_id,/);
  });

  it('answers 404 for reviews of an unknown destination', async () => {
    const res = await request(createAuthedApp(createFakeDb())).get(
      '/api/v1/destinations/nope/reviews',
    );
    expect(res.status).toBe(404);
  });

  it('creates a review inside one transaction that locks the destination first', async () => {
    const db = createFakeDb([
      lockedDestination,
      ['INSERT INTO reviews', rows(reviewRow)],
      ratingTotals,
    ]);
    const res = await request(createAuthedApp(db))
      .post(`/api/v1/destinations/${SLUG}/reviews`)
      .set('Authorization', await bearerFor())
      .send({ rating: 4, comment: 'Hermosa' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: reviewRow, meta: { avg_rating: 4, reviews_count: 1 } });
    const sql = db.statements();
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('FOR UPDATE');
    expect(sql[2]).toContain('INSERT INTO reviews');
    expect(sql[3]).toContain('UPDATE destinations');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(db.log[2].params).toEqual([DESTINATION_ID, USER_ID, 4, 'Hermosa']);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 409 REVIEW_EXISTS and leaves the counters alone when the user already reviewed', async () => {
    const db = createFakeDb([lockedDestination, ['INSERT INTO reviews', rows()]]);
    const res = await request(createAuthedApp(db))
      .post(`/api/v1/destinations/${SLUG}/reviews`)
      .set('Authorization', await bearerFor())
      .send({ rating: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVIEW_EXISTS');
    expect(db.has('UPDATE destinations')).toBe(false);
  });

  it('answers 404 and rolls back for an unpublished or unknown destination', async () => {
    const db = createFakeDb();
    const res = await request(createAuthedApp(db))
      .post(`/api/v1/destinations/${SLUG}/reviews`)
      .set('Authorization', await bearerFor())
      .send({ rating: 3 });
    expect(res.status).toBe(404);
    expect(db.statements().at(-1)).toBe('ROLLBACK');
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, 201],
    [false, 200],
  ])('PUT /reviews/me upsert (inserted=%s) answers %i', async (inserted, status) => {
    const db = createFakeDb([
      lockedDestination,
      ['ON CONFLICT (destination_id, user_id) DO UPDATE', rows({ ...reviewRow, inserted })],
      ratingTotals,
    ]);
    const res = await request(createAuthedApp(db))
      .put(`/api/v1/destinations/${SLUG}/reviews/me`)
      .set('Authorization', await bearerFor())
      .send({ rating: 5 });
    expect(res.status).toBe(status);
    expect(res.body.data).not.toHaveProperty('inserted');
    expect(res.body.meta).toEqual({ avg_rating: 4, reviews_count: 1 });
  });

  it('rolls back and reports 500 when the counter recompute fails', async () => {
    const db = createFakeDb([
      lockedDestination,
      ['INSERT INTO reviews', rows(reviewRow)],
      ['UPDATE destinations d SET avg_rating', new Error('deadlock')],
    ]);
    const res = await request(createAuthedApp(db))
      .post(`/api/v1/destinations/${SLUG}/reviews`)
      .set('Authorization', await bearerFor())
      .send({ rating: 4 });
    expect(res.status).toBe(500);
    expect(db.statements().at(-1)).toBe('ROLLBACK');
  });
});

describe('favorites', () => {
  const favoriteScript = (rowCount) => [
    lockedDestination,
    ['INSERT INTO favorites', { rows: [], rowCount }],
    ['DELETE FROM favorites', { rows: [], rowCount }],
    ['SET favorites_count', rows({ favorites_count: 3 })],
    ['SELECT favorites_count', rows({ favorites_count: 3 })],
  ];

  it('PUT recomputes the counter only when the row was really inserted', async () => {
    const created = createFakeDb(favoriteScript(1));
    const res = await request(createAuthedApp(created))
      .put(`/api/v1/me/favorites/${SLUG}`)
      .set('Authorization', await bearerFor());
    expect(res.body).toEqual({
      data: { slug: SLUG, favorited: true, changed: true },
      meta: { favorites_count: 3 },
    });
    expect(created.has('SET favorites_count')).toBe(true);

    const repeated = createFakeDb(favoriteScript(0));
    const again = await request(createAuthedApp(repeated))
      .put(`/api/v1/me/favorites/${SLUG}`)
      .set('Authorization', await bearerFor());
    expect(again.status).toBe(200);
    expect(again.body.data.changed).toBe(false);
    expect(repeated.has('SET favorites_count')).toBe(false);
  });

  it('DELETE is idempotent and can remove a favorite of an unpublished destination', async () => {
    const db = createFakeDb(favoriteScript(0));
    const res = await request(createAuthedApp(db))
      .delete(`/api/v1/me/favorites/${SLUG}`)
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ slug: SLUG, favorited: false, changed: false });
    expect(db.log[1].text).not.toContain("status = 'published'");
  });

  it('PUT answers 404 for an unknown destination', async () => {
    const res = await request(createAuthedApp(createFakeDb()))
      .put('/api/v1/me/favorites/nope')
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(404);
  });

  it('lists the favorites with the catalog shape and marks them no-store', async () => {
    const db = createFakeDb([
      [
        'JOIN favorites f',
        rows({
          id: DESTINATION_ID,
          slug: SLUG,
          name: 'Balandra',
          category_slug: 'playa',
          category_name: 'Playa',
          lat: 24,
          lng: -110,
          images: [],
          favorited_at: '2026-10-02T00:00:00Z',
        }),
      ],
      ['count(*)::int AS total', rows({ total: 1 })],
    ]);
    const res = await request(createAuthedApp(db))
      .get('/api/v1/me/favorites')
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ slug: SLUG, favorited_at: '2026-10-02T00:00:00Z' });
    expect(res.body.meta.limit).toBe(50);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(db.log[0].params[0]).toBe(USER_ID);
  });
});

describe('events', () => {
  const eventRow = {
    id: EVENT_ID,
    title: 'Limpieza',
    description: '',
    starts_at: '2030-01-01T10:00:00Z',
    ends_at: null,
    location_name: 'Balandra',
    lat: 24,
    lng: -110,
    destination_slug: SLUG,
    image_url: null,
    capacity: null,
    attendees_count: 2,
  };

  it('anonymous reads are publicly cacheable, vary on Authorization and have no attending flag', async () => {
    const db = createFakeDb([['FROM events e', rows(eventRow)]]);
    const res = await request(createAuthedApp(db)).get(`/api/v1/events/${EVENT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('attending');
    expect(res.headers['cache-control']).toMatch(/^public, max-age=60, stale-while-revalidate=300/);
    expect(res.headers.vary).toMatch(/Authorization/);
  });

  it('a valid session adds attending and forbids shared caching', async () => {
    const db = createFakeDb([['FROM events e', rows({ ...eventRow, attending: true })]]);
    const res = await request(createAuthedApp(db))
      .get(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', await bearerFor());
    expect(res.body.data.attending).toBe(true);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(db.log[0].params).toEqual([EVENT_ID, USER_ID]);
  });

  it('treats a forged or expired token as anonymous instead of failing a public read', async () => {
    const db = createFakeDb([['FROM events e', rows(eventRow)]]);
    const res = await request(createAuthedApp(db))
      .get(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/^public/);
  });

  it('serves the list without a session when auth is not configured', async () => {
    const db = createFakeDb([
      ['FROM events e', rows(eventRow)],
      ['count(*)::int AS total', rows({ total: 1 })],
    ]);
    const app = createApp({ clientOrigin: 'http://localhost:5173', db, rateLimitPerMinute: 1000 });
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: EVENT_ID, attendees_count: 2 });
  });

  it('404 for an unknown event, with a no-store error body', async () => {
    const res = await request(createAuthedApp(createFakeDb())).get(`/api/v1/events/${EVENT_ID}`);
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('attendance PUT inserts for an open event and reports the new total', async () => {
    const db = createFakeDb([
      ['FOR SHARE', rows({ id: EVENT_ID, is_open: true })],
      ['count(*)::int AS total', rows({ total: 3 })],
    ]);
    const res = await request(createAuthedApp(db))
      .put(`/api/v1/events/${EVENT_ID}/attendance`)
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { event_id: EVENT_ID, attending: true },
      meta: { attendees_count: 3 },
    });
    expect(db.has('INSERT INTO event_attendances')).toBe(true);
  });

  it('attendance PUT answers 409 EVENT_NOT_OPEN once the event has ended', async () => {
    const db = createFakeDb([['FOR SHARE', rows({ id: EVENT_ID, is_open: false })]]);
    const res = await request(createAuthedApp(db))
      .put(`/api/v1/events/${EVENT_ID}/attendance`)
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_NOT_OPEN');
    expect(db.has('INSERT INTO event_attendances')).toBe(false);
  });

  it('attendance PUT answers 404 for unpublished or unknown events', async () => {
    const res = await request(createAuthedApp(createFakeDb()))
      .put(`/api/v1/events/${EVENT_ID}/attendance`)
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(404);
  });

  it('attendance DELETE is idempotent', async () => {
    const db = createFakeDb([
      ['SELECT id FROM events WHERE id', rows({ id: EVENT_ID })],
      ['count(*)::int AS total', rows({ total: 0 })],
    ]);
    const res = await request(createAuthedApp(db))
      .delete(`/api/v1/events/${EVENT_ID}/attendance`)
      .set('Authorization', await bearerFor());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ event_id: EVENT_ID, attending: false });
  });

  it('GET /me/events validates the scope', async () => {
    const db = createFakeDb([['count(*)::int AS total', rows({ total: 0 })]]);
    const app = createAuthedApp(db);
    const auth = await bearerFor();
    const bad = await request(app).get('/api/v1/me/events?scope=evil').set('Authorization', auth);
    expect(bad.status).toBe(400);
    const ok = await request(app).get('/api/v1/me/events?scope=past').set('Authorization', auth);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual([]);
  });
});
