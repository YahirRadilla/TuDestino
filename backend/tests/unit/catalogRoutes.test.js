import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const appWith = (query) =>
  createApp({ clientOrigin: 'http://localhost:5173', db: { query }, rateLimitPerMinute: 1000 });

describe('catalog routes (mocked database)', () => {
  it('rejects an invalid query with 400 and the uniform error format', async () => {
    const query = vi.fn();
    const res = await request(appWith(query)).get('/api/v1/destinations?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a malformed near parameter with 400', async () => {
    const res = await request(appWith(vi.fn())).get('/api/v1/destinations?near=hello');
    expect(res.status).toBe(400);
  });

  it('responds {data, meta} for a valid list request', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });
    const res = await request(appWith(query)).get('/api/v1/destinations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, limit: 12, total: 0, total_pages: 0 },
    });
  });

  it('responds 404 with the uniform format for an unknown destination', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const res = await request(appWith(query)).get('/api/v1/destinations/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('hides database failures behind a generic 500', async () => {
    const query = vi.fn().mockRejectedValue(new Error('password authentication failed'));
    const res = await request(appWith(query)).get('/api/v1/destination-categories');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('readiness reports 503 when the database is down', async () => {
    const query = vi.fn().mockRejectedValue(new Error('down'));
    const res = await request(appWith(query)).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });

  it('readiness reports ok when the database answers', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const res = await request(appWith(query)).get('/api/v1/health/ready');
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('rate limits public routes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createApp({
      clientOrigin: 'http://localhost:5173',
      db: { query },
      rateLimitPerMinute: 2,
    });
    await request(app).get('/api/v1/edu-categories');
    await request(app).get('/api/v1/edu-categories');
    const res = await request(app).get('/api/v1/edu-categories');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
