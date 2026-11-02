import { describe, it, expect } from 'vitest';
import { DESTINATIONS, CATEGORIES, getDestinationBySlug, getDestinationsByCategory } from './seed.js';

describe('destinations seed', () => {
  it('has 8 destinations with unique slugs and ids', () => {
    expect(DESTINATIONS).toHaveLength(8);
    expect(new Set(DESTINATIONS.map((d) => d.slug)).size).toBe(8);
    expect(new Set(DESTINATIONS.map((d) => d.id)).size).toBe(8);
  });

  it('every destination uses a known category and has 3 images', () => {
    const known = CATEGORIES.map((c) => c.id);
    for (const d of DESTINATIONS) {
      expect(d.categories.every((c) => known.includes(c))).toBe(true);
      expect(d.images).toHaveLength(3);
    }
  });

  it('finds by slug and filters by category', () => {
    expect(getDestinationBySlug('balandra').name).toBe('Balandra');
    expect(getDestinationBySlug('nope')).toBeUndefined();
    expect(getDestinationsByCategory('anp').length).toBeGreaterThan(0);
    expect(getDestinationsByCategory(null)).toHaveLength(8);
  });
});
