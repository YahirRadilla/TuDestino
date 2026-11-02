import { describe, it, expect } from 'vitest';
import { listDestinationsQuery, slugParams } from '../../src/validators/destinations.js';
import { listEventsQuery } from '../../src/validators/events.js';
import { listEduContentsQuery } from '../../src/validators/education.js';

describe('listDestinationsQuery', () => {
  it('applies pagination defaults', () => {
    const result = listDestinationsQuery.parse({});
    expect(result).toMatchObject({ page: 1, limit: 12 });
    expect(result.near).toBeUndefined();
  });

  it('coerces page and limit from strings', () => {
    expect(listDestinationsQuery.parse({ page: '3', limit: '20' })).toMatchObject({
      page: 3,
      limit: 20,
    });
  });

  it.each([{ limit: '101' }, { limit: '0' }, { page: '0' }, { page: '1.5' }, { page: 'abc' }])(
    'rejects out-of-bounds pagination %o',
    (query) => {
      expect(listDestinationsQuery.safeParse(query).success).toBe(false);
    },
  );

  it('parses near=lat,lng into numbers', () => {
    expect(listDestinationsQuery.parse({ near: '24.14,-110.31' }).near).toEqual({
      lat: 24.14,
      lng: -110.31,
    });
  });

  it.each(['abc', '24.1', '91,0', '0,181', '1,2,3', ''])('rejects malformed near=%j', (near) => {
    expect(listDestinationsQuery.safeParse({ near }).success).toBe(false);
  });

  it('accepts only slug-shaped categories', () => {
    expect(listDestinationsQuery.parse({ category: 'playa' }).category).toBe('playa');
    expect(listDestinationsQuery.safeParse({ category: "playa'; DROP TABLE" }).success).toBe(false);
  });

  it('trims q, drops it when blank and bounds its length', () => {
    expect(listDestinationsQuery.parse({ q: '  tortuga ' }).q).toBe('tortuga');
    expect(listDestinationsQuery.parse({ q: '   ' }).q).toBeUndefined();
    expect(listDestinationsQuery.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it('ignores unknown parameters', () => {
    expect(listDestinationsQuery.parse({ admin: 'true' })).not.toHaveProperty('admin');
  });
});

describe('slugParams', () => {
  it('accepts a valid slug', () => {
    expect(slugParams.parse({ slug: 'playa-el-tecolote' })).toEqual({ slug: 'playa-el-tecolote' });
  });

  it('rejects an invalid slug', () => {
    expect(slugParams.safeParse({ slug: 'Not A Slug!' }).success).toBe(false);
  });
});

describe('listEventsQuery', () => {
  it('applies pagination defaults', () => {
    expect(listEventsQuery.parse({})).toEqual({ page: 1, limit: 12 });
  });
});

describe('listEduContentsQuery', () => {
  it('accepts category, type and q', () => {
    expect(listEduContentsQuery.parse({ category: 'fauna', type: 'video', q: 'tortugas' })).toEqual(
      { page: 1, limit: 12, category: 'fauna', type: 'video', q: 'tortugas' },
    );
  });

  it('rejects unknown content types', () => {
    expect(listEduContentsQuery.safeParse({ type: 'podcast' }).success).toBe(false);
  });
});
