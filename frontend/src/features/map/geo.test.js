import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistance, isValidCoordinate, sortByDistance } from './geo.js';

describe('distanceKm', () => {
  it('is zero for the same point and symmetric', () => {
    const a = { lat: 24.14, lng: -110.31 };
    const b = { lat: 24.0, lng: -110.0 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it('matches a known distance (La Paz to Cabo San Lucas, ~145 km in a straight line)', () => {
    const laPaz = { lat: 24.1426, lng: -110.3128 };
    const cabo = { lat: 22.8905, lng: -109.9167 };
    expect(distanceKm(laPaz, cabo)).toBeGreaterThan(140);
    expect(distanceKm(laPaz, cabo)).toBeLessThan(150);
  });
});

describe('formatDistance', () => {
  it.each([
    [0.04, '40 m'],
    [0.5, '500 m'],
    [2.34, '2.3 km'],
    [48.6, '49 km'],
  ])('formats %s km as %s', (km, text) => {
    expect(formatDistance(km)).toBe(text);
  });

  it('returns an empty string for a non-number', () => {
    expect(formatDistance(NaN)).toBe('');
  });
});

describe('sortByDistance', () => {
  it('orders nearest first and adds distanceKm without mutating the input', () => {
    const items = [
      { title: 'Lejos', position: { lat: 23, lng: -110 } },
      { title: 'Cerca', position: { lat: 24.15, lng: -110.31 } },
    ];
    const sorted = sortByDistance(items, { lat: 24.14, lng: -110.31 });
    expect(sorted.map((item) => item.title)).toEqual(['Cerca', 'Lejos']);
    expect(sorted[0].distanceKm).toBeLessThan(sorted[1].distanceKm);
    expect(items[0].distanceKm).toBeUndefined();
  });
});

describe('isValidCoordinate', () => {
  it('accepts numbers and numeric strings in range', () => {
    expect(isValidCoordinate({ lat: 24.1, lng: -110.3 })).toBe(true);
    expect(isValidCoordinate({ lat: '24.1', lng: '-110.3' })).toBe(true);
  });

  it.each([
    [{ lat: '', lng: '' }],
    [{ lat: 'abc', lng: 1 }],
    [{ lat: 91, lng: 0 }],
    [{ lat: 0, lng: 181 }],
    [{ lat: null, lng: 0 }],
    [null],
  ])('rejects %j', (point) => {
    expect(isValidCoordinate(point)).toBe(false);
  });
});
