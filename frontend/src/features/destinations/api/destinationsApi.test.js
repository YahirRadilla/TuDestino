import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markCatalogStale } from '../../../storage/catalogFreshness.js';
import { fetchDestination, fetchDestinations, toDestination } from './destinationsApi.js';

const apiItem = {
  id: 'uuid-1',
  slug: 'balandra',
  name: 'Balandra',
  summary: 'Bahía protegida.',
  municipality: 'La Paz',
  is_protected_area: true,
  avg_rating: 4.9,
  reviews_count: 342,
  category: { slug: 'anp', name: 'Áreas protegidas' },
  location: { lat: 24.3185, lng: -110.3249 },
  images: [{ url: '/img/balandra-1.svg', alt_text: null }],
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const stubFetch = (body, status = 200) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

describe('toDestination', () => {
  it('maps the API shape to the UI shape using the slug as the stable id', () => {
    expect(toDestination(apiItem)).toMatchObject({
      id: 'balandra',
      slug: 'balandra',
      location: 'La Paz, Baja California Sur',
      categories: ['anp'],
      tag: 'Áreas protegidas',
      rating: 4.9,
      reviews: 342,
      coords: { lat: 24.3185, lng: -110.3249 },
      images: ['/img/balandra-1.svg'],
      details: [],
      care: [],
    });
    expect(toDestination(apiItem).distanceKm).toBeUndefined();
  });

  it('keeps distance_km, highlights and care tips when present', () => {
    const mapped = toDestination({
      ...apiItem,
      distance_km: 12.3,
      description: 'Larga.',
      highlights: [{ icon: 'shield', label: 'Área protegida' }],
      care_tips: ['No pises el manglar.'],
    });
    expect(mapped).toMatchObject({
      distanceKm: 12.3,
      description: 'Larga.',
      details: [{ icon: 'shield', label: 'Área protegida' }],
      care: ['No pises el manglar.'],
    });
  });
});

describe('fetchDestinations', () => {
  it('returns mapped destinations and sends filters as query params', async () => {
    stubFetch({ data: [apiItem], meta: { total: 1 } });
    const result = await fetchDestinations({ category: 'anp', near: { lat: 24.1, lng: -110.3 } });
    expect(result[0].slug).toBe('balandra');
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('category=anp');
    expect(url).toContain('near=24.1%2C-110.3');
  });

  it('rejects an unexpected payload such as an HTML page served by a proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>')));
    await expect(fetchDestinations({})).rejects.toMatchObject({ kind: 'http' });
  });

  it('uses a new URL after a write so cached ratings cannot win', async () => {
    stubFetch({ data: [apiItem], meta: { total: 1 } });
    markCatalogStale();
    await fetchDestinations({});
    expect(String(fetch.mock.calls[0][0])).toContain('_r=');
  });
});

describe('fetchDestination', () => {
  it('returns null on 404', async () => {
    stubFetch({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
    await expect(fetchDestination('nope')).resolves.toBeNull();
  });

  it('propagates other http errors', async () => {
    stubFetch({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, 500);
    await expect(fetchDestination('balandra')).rejects.toMatchObject({ status: 500 });
  });
});
