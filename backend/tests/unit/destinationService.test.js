import { describe, it, expect, vi } from 'vitest';
import { listDestinations, getDestinationBySlug } from '../../src/services/destinationService.js';
import { HttpError } from '../../src/utils/httpError.js';

const row = {
  id: '6f1c0b9e-0000-4000-8000-000000000001',
  slug: 'balandra',
  name: 'Balandra',
  summary: 'Bahía protegida.',
  municipality: 'La Paz',
  is_protected_area: true,
  avg_rating: 4.9,
  reviews_count: 342,
  category_slug: 'anp',
  category_name: 'Áreas protegidas',
  lat: 24.3185,
  lng: -110.3249,
  images: [{ url: '/img/balandra-1.svg', alt_text: null }],
};

function fakeDb(...results) {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  return { query };
}

describe('listDestinations', () => {
  const base = { page: 1, limit: 12 };

  it('returns mapped items with pagination meta', async () => {
    const db = fakeDb([row], [{ total: 25 }]);
    const result = await listDestinations(db, base);
    expect(result.meta).toEqual({ page: 1, limit: 12, total: 25, total_pages: 3 });
    expect(result.data[0]).toMatchObject({
      slug: 'balandra',
      category: { slug: 'anp', name: 'Áreas protegidas' },
      location: { lat: 24.3185, lng: -110.3249 },
    });
    expect(result.data[0]).not.toHaveProperty('distance_km');
  });

  it('never exposes internal columns or user identifiers', async () => {
    const db = fakeDb([{ ...row, user_id: 'secret', created_by: 'secret' }], [{ total: 1 }]);
    const { data } = await listDestinations(db, base);
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('rounds distance_km to one decimal when ordering by proximity', async () => {
    const db = fakeDb([{ ...row, distance_km: 12.3456 }], [{ total: 1 }]);
    const { data } = await listDestinations(db, { ...base, near: { lat: 24, lng: -110 } });
    expect(data[0].distance_km).toBe(12.3);
  });

  it('always passes user input as bound parameters, never inline', async () => {
    const db = fakeDb([], [{ total: 0 }]);
    const hostile = "x'; DROP TABLE destinations; --";
    await listDestinations(db, { ...base, q: hostile, category: hostile });
    for (const [sql, values] of db.query.mock.calls) {
      expect(sql).not.toContain('DROP TABLE');
      expect(values).toContain(hostile);
    }
  });

  it('computes the offset from page and limit', async () => {
    const db = fakeDb([], [{ total: 0 }]);
    await listDestinations(db, { page: 3, limit: 10 });
    const [, values] = db.query.mock.calls[0];
    expect(values.slice(-2)).toEqual([10, 20]);
  });

  it('returns zero pages for an empty result', async () => {
    const db = fakeDb([], [{ total: 0 }]);
    const result = await listDestinations(db, base);
    expect(result.data).toEqual([]);
    expect(result.meta.total_pages).toBe(0);
  });
});

describe('getDestinationBySlug', () => {
  it('returns the detail with images and care information', async () => {
    const detail = {
      ...row,
      description: 'Larga descripción.',
      regulations: 'Aforo regulado.',
      care_tips: ['No pises el manglar.'],
      highlights: [{ icon: 'shield', label: 'Área protegida' }],
    };
    const db = fakeDb([detail]);
    const result = await getDestinationBySlug(db, 'balandra');
    expect(result.data).toMatchObject({
      slug: 'balandra',
      description: 'Larga descripción.',
      care_tips: ['No pises el manglar.'],
      highlights: [{ icon: 'shield', label: 'Área protegida' }],
      images: [{ url: '/img/balandra-1.svg', alt_text: null }],
    });
  });

  it('throws a 404 HttpError when the slug is unknown', async () => {
    const db = fakeDb([]);
    await expect(getDestinationBySlug(db, 'nope')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(getDestinationBySlug(fakeDb([]), 'nope')).rejects.toBeInstanceOf(HttpError);
  });
});
