import { describe, expect, it } from 'vitest';
import { distanceBetweenKm, findLocalDestinations } from './localCatalog.js';

describe('distanceBetweenKm', () => {
  it('is zero for the same point and symmetric otherwise', () => {
    const a = { lat: 24.14, lng: -110.31 };
    const b = { lat: 23.43, lng: -109.42 };
    expect(distanceBetweenKm(a, a)).toBe(0);
    expect(distanceBetweenKm(a, b)).toBeCloseTo(distanceBetweenKm(b, a), 6);
    expect(distanceBetweenKm(a, b)).toBeGreaterThan(80);
    expect(distanceBetweenKm(a, b)).toBeLessThan(130);
  });
});

describe('findLocalDestinations', () => {
  it('returns everything without filters', () => {
    expect(findLocalDestinations({})).toHaveLength(8);
  });

  it('filters by category and by accent-insensitive text', () => {
    expect(findLocalDestinations({ category: 'cultura' }).map((d) => d.slug)).toEqual(['todos-santos']);
    expect(findLocalDestinations({ q: 'espiritu' }).map((d) => d.slug)).toContain('espiritu-santo');
  });

  it('sorts by distance and fills distanceKm when near is given', () => {
    const result = findLocalDestinations({ near: { lat: 26.8, lng: -113.2 } });
    expect(result[0].slug).toBe('laguna-san-ignacio');
    expect(result[0].distanceKm).toBeLessThan(1);
    const distances = result.map((d) => d.distanceKm);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });
});
