import { describe, expect, it } from 'vitest';
import { STORES } from './db.js';
import { getSyncedAt, mirrorDestinations, mirrorEvents, readMirror, readMirrorItem } from './catalogCache.js';

const dest = (slug, extra = {}) => ({ slug, name: slug.toUpperCase(), ...extra });

describe('catalog mirror', () => {
  it('reports an empty mirror before anything was stored', async () => {
    expect(await readMirror(STORES.destinations)).toEqual({ items: [], syncedAt: null });
    expect(await readMirrorItem(STORES.destinations, 'x')).toBeNull();
  });

  it('stores items and the sync time', async () => {
    await mirrorDestinations([dest('a'), dest('b')]);
    const { items, syncedAt } = await readMirror(STORES.destinations);
    expect(items.map((i) => i.slug).sort()).toEqual(['a', 'b']);
    expect(Number.isNaN(Date.parse(syncedAt))).toBe(false);
    expect(await getSyncedAt(STORES.destinations)).toBe(syncedAt);
  });

  it('never persists query- or user-dependent fields', async () => {
    await mirrorDestinations([dest('a', { distance_km: 12 })]);
    await mirrorEvents([{ id: 'e1', title: 'x', attending: true }]);
    expect((await readMirror(STORES.destinations)).items[0]).not.toHaveProperty('distance_km');
    expect((await readMirror(STORES.events)).items[0]).not.toHaveProperty('attending');
  });

  it('a partial list upserts without erasing detail fields or other records', async () => {
    await mirrorDestinations([dest('a', { description: 'larga' }), dest('b')]);
    await mirrorDestinations([dest('a', { name: 'A2' })]);
    const { items } = await readMirror(STORES.destinations);
    expect(items.find((i) => i.slug === 'a')).toMatchObject({ name: 'A2', description: 'larga' });
    expect(items).toHaveLength(2);
  });

  it('a complete snapshot drops records that disappeared upstream', async () => {
    await mirrorDestinations([dest('a'), dest('b')]);
    await mirrorDestinations([dest('a')], { complete: true });
    expect((await readMirror(STORES.destinations)).items.map((i) => i.slug)).toEqual(['a']);
  });

  it('reads one record with the store sync time', async () => {
    await mirrorEvents([{ id: 'e1', title: 'Limpieza' }]);
    const found = await readMirrorItem(STORES.events, 'e1');
    expect(found.item.title).toBe('Limpieza');
    expect(found.syncedAt).toBeTruthy();
  });
});
