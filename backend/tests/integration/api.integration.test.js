import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';

// Requires a migrated and seeded PostgreSQL/PostGIS (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('public catalog API (PostgreSQL)', () => {
  let pool;
  let app;

  beforeAll(() => {
    pool = createPool(process.env.DATABASE_URL);
    app = createApp({
      clientOrigin: 'http://localhost:5173',
      db: pool,
      rateLimitPerMinute: 10_000,
    });
  });
  afterAll(() => pool.end());

  it('readiness verifies the database', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('lists the seeded destinations with {data, meta}', async () => {
    const res = await request(app).get('/api/v1/destinations?limit=50');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 50, total: 8, total_pages: 1 });
    expect(res.body.data).toHaveLength(8);
    expect(res.body.data[0]).toMatchObject({
      slug: expect.any(String),
      category: { slug: expect.any(String), name: expect.any(String) },
      location: { lat: expect.any(Number), lng: expect.any(Number) },
    });
    expect(res.body.data[0].images.length).toBeGreaterThan(0);
  });

  it('paginates without overlapping pages', async () => {
    const first = await request(app).get('/api/v1/destinations?limit=3&page=1');
    const second = await request(app).get('/api/v1/destinations?limit=3&page=2');
    const slugs = [...first.body.data, ...second.body.data].map((d) => d.slug);
    expect(new Set(slugs).size).toBe(6);
    expect(first.body.meta.total_pages).toBe(3);
  });

  it('filters by category slug', async () => {
    const res = await request(app).get('/api/v1/destinations?category=cultura');
    expect(res.body.data.map((d) => d.slug)).toEqual(['todos-santos']);
  });

  it('searches with Spanish full-text search', async () => {
    const res = await request(app).get('/api/v1/destinations?q=ballenas');
    expect(res.body.data.map((d) => d.slug)).toContain('laguna-san-ignacio');
    const none = await request(app).get('/api/v1/destinations?q=zzzinexistente');
    expect(none.body.data).toEqual([]);
    expect(none.body.meta.total).toBe(0);
  });

  it('treats hostile search text as data, not SQL', async () => {
    const res = await request(app).get(
      `/api/v1/destinations?q=${encodeURIComponent("'; DROP TABLE destinations; --")}`,
    );
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/v1/destinations');
    expect(after.body.meta.total).toBe(8);
  });

  it('orders by distance and returns distance_km with near=lat,lng', async () => {
    const res = await request(app).get('/api/v1/destinations?near=24.14,-110.31&limit=50');
    const distances = res.body.data.map((d) => d.distance_km);
    expect(distances.every((n) => typeof n === 'number')).toBe(true);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(res.body.data[0].slug).not.toBe('laguna-san-ignacio');
    expect(res.body.data.at(-1).slug).toBe('laguna-san-ignacio');
  });

  it('returns the detail with images, care tips and no internal columns', async () => {
    const res = await request(app).get('/api/v1/destinations/balandra');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'balandra', is_protected_area: true });
    expect(res.body.data.care_tips.length).toBeGreaterThan(0);
    expect(res.body.data.images).toHaveLength(3);
    for (const key of ['user_id', 'created_by', 'deleted_at', 'status', 'search_vector']) {
      expect(res.body.data).not.toHaveProperty(key);
    }
  });

  it('returns 404 for an unknown or unpublished destination', async () => {
    const res = await request(app).get('/api/v1/destinations/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('hides soft-deleted destinations', async () => {
    await pool.query(`UPDATE destinations SET deleted_at = now() WHERE slug = 'todos-santos'`);
    try {
      const res = await request(app).get('/api/v1/destinations/todos-santos');
      expect(res.status).toBe(404);
      const list = await request(app).get('/api/v1/destinations?category=cultura');
      expect(list.body.data).toEqual([]);
    } finally {
      await pool.query(`UPDATE destinations SET deleted_at = NULL WHERE slug = 'todos-santos'`);
    }
  });

  it('lists destination categories', async () => {
    const res = await request(app).get('/api/v1/destination-categories');
    expect(res.body.data.map((c) => c.slug).sort()).toEqual(['anp', 'cultura', 'mirador', 'playa']);
  });

  it('lists only upcoming published events ordered by date', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    const dates = res.body.data.map((e) => new Date(e.starts_at).getTime());
    expect(dates.every((t) => t > Date.now())).toBe(true);
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    expect(res.body.data[0]).not.toHaveProperty('organizer_id');
  });

  it('lists published education contents and filters by type and search', async () => {
    const all = await request(app).get('/api/v1/edu-contents');
    expect(all.body.meta.total).toBe(5);
    const videos = await request(app).get('/api/v1/edu-contents?type=video');
    expect(videos.body.data.every((c) => c.type === 'video')).toBe(true);
    const found = await request(app).get('/api/v1/edu-contents?q=tortuga');
    expect(found.body.data.map((c) => c.slug)).toContain('que-hacer-si-ves-una-tortuga-anidando');
  });

  it('lists education categories', async () => {
    const res = await request(app).get('/api/v1/edu-categories');
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });
});
