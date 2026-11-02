import { describe, expect, it } from 'vitest';
import { isUniqueViolation, pickFreeSlug, slugify } from '../../src/utils/slugify.js';

describe('slugify', () => {
  it('lowercases, strips accents and joins words with single hyphens', () => {
    expect(slugify('Playa El Tecolote')).toBe('playa-el-tecolote');
    expect(slugify('  Cabo Pulmo: Área Protegida!! ')).toBe('cabo-pulmo-area-protegida');
    expect(slugify('Año 2026 / Ñandú')).toBe('ano-2026-nandu');
  });

  it('never returns an empty slug and respects the maximum length', () => {
    expect(slugify('¡¡¡')).toBe('sin-titulo');
    const long = slugify('a'.repeat(200), 20);
    expect(long).toHaveLength(20);
    expect(slugify('abc def ghi', 4)).toBe('abc');
  });
});

describe('pickFreeSlug', () => {
  it('keeps the base when it is free and numbers it otherwise', () => {
    expect(pickFreeSlug('playa', [])).toBe('playa');
    expect(pickFreeSlug('playa', ['playa'])).toBe('playa-2');
    expect(pickFreeSlug('playa', ['playa', 'playa-2', 'playa-3'])).toBe('playa-4');
    expect(pickFreeSlug('playa', ['playa-2'])).toBe('playa');
  });
});

describe('isUniqueViolation', () => {
  it('recognises PostgreSQL error 23505 only', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
