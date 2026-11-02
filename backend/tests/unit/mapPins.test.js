import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminPinsQuery, MAP_PINS_MAX, publicPinsQuery } from '../../src/validators/map.js';
import { getAdminPins, getPublicPins } from '../../src/services/mapService.js';
import { findPublicReportPins } from '../../src/models/mapModel.js';
import { bearerFor, createAuthedApp } from '../helpers/authApp.js';
import { createFakeDb, rows } from '../helpers/fakeDb.js';

describe('map pin query validation', () => {
  it('defaults to the maximum limit and no bbox', () => {
    expect(publicPinsQuery.parse({})).toEqual({ bbox: undefined, limit: MAP_PINS_MAX });
  });

  it('parses a bbox in minLng,minLat,maxLng,maxLat order', () => {
    const parsed = publicPinsQuery.parse({ bbox: '-110.5,24.0,-109.9,24.4' });
    expect(parsed.bbox).toEqual({ minLng: -110.5, minLat: 24, maxLng: -109.9, maxLat: 24.4 });
  });

  it.each([
    '1,2,3',
    'a,b,c,d',
    '-110,24,-111,25', // min > max
    '-200,24,-110,25',
    '-110,95,-109,96',
    '-110,24,-109,25,1',
    '1e3,2,3,4',
  ])('rejects the bbox %s', (bbox) => {
    expect(publicPinsQuery.safeParse({ bbox }).success).toBe(false);
  });

  it('rejects a limit above the maximum and below 1', () => {
    expect(publicPinsQuery.safeParse({ limit: String(MAP_PINS_MAX + 1) }).success).toBe(false);
    expect(publicPinsQuery.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('treats an empty bbox as absent', () => {
    expect(publicPinsQuery.parse({ bbox: '' }).bbox).toBeUndefined();
  });

  it('admin query accepts a status and a type, and rejects unknown statuses', () => {
    expect(adminPinsQuery.parse({ status: 'pending', type: 'contaminacion' })).toMatchObject({
      status: 'pending',
      type: 'contaminacion',
    });
    expect(adminPinsQuery.safeParse({ status: 'bogus' }).success).toBe(false);
  });
});

describe('public report pin SQL', () => {
  it('snaps coordinates in SQL and selects no sensitive column', async () => {
    const db = createFakeDb();
    await findPublicReportPins(db, { bbox: undefined, limit: 10 });
    const { text, params } = db.log[0];
    expect(text).toContain('ST_SnapToGrid');
    expect(text).toContain("r.status = 'resolved'");
    expect(text).toContain('t.is_sensitive = false');
    for (const forbidden of [
      'description',
      'folio',
      'client_uuid',
      'reporter_id',
      'tracking_code',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // The raw location is only ever read through the snapping function.
    expect(text.match(/r\.location/g)).toHaveLength(
      text.match(/ST_SnapToGrid\(r\.location/g).length,
    );
    expect(params).toContain(11);
  });

  it('applies the bbox to the snapped point, never to the real one', async () => {
    const db = createFakeDb();
    await findPublicReportPins(db, {
      bbox: { minLng: -111, minLat: 24, maxLng: -110, maxLat: 25 },
      limit: 5,
    });
    expect(db.log[0].text).toMatch(
      /ST_SnapToGrid\(r\.location::geometry, \$1::float8\) && ST_MakeEnvelope/,
    );
  });
});

describe('map service', () => {
  it('maps a public report to a whitelist and flags truncation', async () => {
    const db = createFakeDb([
      ['FROM destinations d', rows()],
      [
        'FROM reports r',
        rows(
          {
            pin_id: 'aaaa',
            type_slug: 'contaminacion',
            type_name: 'Contaminación',
            month: '2026-09',
            lat: 24.14,
            lng: -110.315,
            description: 'SECRET',
            folio: 'TD-1',
            reporter_id: 'u',
          },
          {
            pin_id: 'bbbb',
            type_slug: 'animal-varado',
            type_name: 'Animal varado',
            month: '2026-08',
            lat: 24.15,
            lng: -110.31,
          },
        ),
      ],
    ]);
    const { data, meta } = await getPublicPins(db, { limit: 1 });
    expect(data.reports).toEqual([
      {
        id: 'aaaa',
        type: { slug: 'contaminacion', name: 'Contaminación' },
        month: '2026-09',
        location: { lat: 24.14, lng: -110.315 },
        approximate: true,
      },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/SECRET|TD-1|reporter/);
    expect(meta.truncated).toEqual({ destinations: false, reports: true });
    expect(meta.report_precision_m).toBe(500);
  });

  it('builds the admin detail path and keeps exact coordinates', async () => {
    const db = createFakeDb([
      [
        'FROM reports r',
        rows({
          id: 'r-1',
          folio: 'TD-2026-000001',
          status: 'pending',
          type_slug: 'tortuga-anidando',
          type_name: 'Tortuga anidando',
          is_sensitive: true,
          created_at: '2026-10-01T00:00:00Z',
          lat: 24.1426,
          lng: -110.3128,
        }),
      ],
    ]);
    const { data } = await getAdminPins(db, { limit: 10 });
    expect(data.reports[0]).toMatchObject({
      folio: 'TD-2026-000001',
      location: { lat: 24.1426, lng: -110.3128 },
      detail_path: '/admin/reportes/r-1',
    });
  });
});

describe('map routes (mocked database)', () => {
  it('answers the public endpoint with caching headers and an ETag', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createApp({
      clientOrigin: 'http://localhost:5173',
      db: { query },
      rateLimitPerMinute: 1000,
    });
    const res = await request(app).get('/api/v1/map/pins');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ destinations: [], reports: [] });
    expect(res.headers['cache-control']).toMatch(/^public, max-age=\d+/);
    expect(res.headers.etag).toBeTruthy();
    const again = await request(app).get('/api/v1/map/pins').set('If-None-Match', res.headers.etag);
    expect(again.status).toBe(304);
  });

  it('rejects an invalid bbox before touching the database', async () => {
    const query = vi.fn();
    const app = createApp({
      clientOrigin: 'http://localhost:5173',
      db: { query },
      rateLimitPerMinute: 1000,
    });
    const res = await request(app).get('/api/v1/map/pins?bbox=oops');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('admin pins answer 401 without a token and 403 to a plain user', async () => {
    const db = createFakeDb([['SELECT role', rows({ role: 'user', is_active: true })]]);
    const app = createAuthedApp(db);
    expect((await request(app).get('/api/v1/admin/map/pins')).status).toBe(401);
    const res = await request(app)
      .get('/api/v1/admin/map/pins')
      .set('Authorization', await bearerFor({ role: 'user' }));
    expect(res.status).toBe(403);
  });
});
