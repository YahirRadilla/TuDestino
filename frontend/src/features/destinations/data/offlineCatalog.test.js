import { describe, expect, it } from 'vitest';
import { CachedData } from '../../../shared/hooks/useRemoteData.js';
import { mirrorDestinations } from '../../../storage/catalogCache.js';
import { loadDestinationOffline, loadDestinationsOffline } from './offlineCatalog.js';

const item = (slug, name, extra = {}) => ({
  id: slug,
  slug,
  name,
  summary: `Resumen de ${name}`,
  municipality: 'La Paz',
  avg_rating: 4.5,
  reviews_count: 3,
  category: { slug: 'playa', name: 'Playas' },
  location: { lat: 24.1, lng: -110.3 },
  images: [{ url: `/img/${slug}.svg`, alt_text: null }],
  ...extra,
});

describe('offline destinations', () => {
  it('falls back to the bundled samples when nothing was ever saved', async () => {
    const result = await loadDestinationsOffline({});
    expect(result).not.toBeInstanceOf(CachedData);
    expect(result).toHaveLength(8);
    expect((await loadDestinationOffline('balandra')).name).toBe('Balandra');
    expect(await loadDestinationOffline('no-existe')).toBeNull();
  });

  it('reads what the user saw online, as UI destinations, with the sync time', async () => {
    await mirrorDestinations([item('uno', 'Playa Uno'), item('dos', 'Cañón Dos')]);
    const result = await loadDestinationsOffline({});
    expect(result).toBeInstanceOf(CachedData);
    expect(result.data.map((d) => d.slug).sort()).toEqual(['dos', 'uno']);
    expect(result.data[0]).toMatchObject({
      id: expect.any(String),
      tag: 'Playas',
      location: expect.any(String),
    });
    expect(result.syncedAt).toBeTruthy();
  });

  it('searches without accents and filters by category, locally', async () => {
    await mirrorDestinations([
      item('uno', 'Playa Uno'),
      item('dos', 'Cañón Dos', { category: { slug: 'mirador', name: 'Miradores' } }),
    ]);
    expect((await loadDestinationsOffline({ q: 'canon' })).data.map((d) => d.slug)).toEqual(['dos']);
    expect((await loadDestinationsOffline({ category: 'playa' })).data.map((d) => d.slug)).toEqual(['uno']);
    expect((await loadDestinationsOffline({ q: 'zzz' })).data).toEqual([]);
  });

  it('"cerca de mí" sorts by Haversine distance without any network', async () => {
    await mirrorDestinations([
      item('lejos', 'Lejos', { location: { lat: 26.8, lng: -113.2 } }),
      item('cerca', 'Cerca', { location: { lat: 24.14, lng: -110.31 } }),
    ]);
    const { data } = await loadDestinationsOffline({ near: { lat: 24.15, lng: -110.3 } });
    expect(data.map((d) => d.slug)).toEqual(['cerca', 'lejos']);
    expect(data[0].distanceKm).toBeLessThan(5);
    expect(data[1].distanceKm).toBeGreaterThan(300);
  });

  it('never leaks a distance computed for an earlier position', async () => {
    await mirrorDestinations([item('uno', 'Uno', { distance_km: 999 })]);
    const { data } = await loadDestinationsOffline({});
    expect(data[0].distanceKm).toBeUndefined();
  });

  it('returns one saved destination, and a list item still renders as a detail', async () => {
    await mirrorDestinations([item('uno', 'Uno')]);
    const result = await loadDestinationOffline('uno');
    expect(result).toBeInstanceOf(CachedData);
    expect(result.data).toMatchObject({ slug: 'uno', description: 'Resumen de Uno' });
  });
});
