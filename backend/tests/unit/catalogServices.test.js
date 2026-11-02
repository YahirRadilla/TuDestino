import { describe, it, expect, vi } from 'vitest';
import { listUpcomingEvents } from '../../src/services/eventService.js';
import { listEduContents, listEduCategories } from '../../src/services/educationService.js';
import { listDestinationCategories } from '../../src/services/destinationService.js';

const fakeDb = (...results) => {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  return { query };
};

describe('listUpcomingEvents', () => {
  it('maps events and exposes coordinates only when present', async () => {
    const db = fakeDb(
      [
        {
          id: 'e1',
          title: 'Limpieza de playa',
          description: 'Jornada comunitaria.',
          starts_at: new Date('2026-11-01T15:00:00Z'),
          ends_at: null,
          location_name: 'Playa El Tecolote',
          lat: null,
          lng: null,
          destination_slug: 'playa-el-tecolote',
          image_url: null,
          capacity: 40,
          organizer_id: 'secret-organizer',
        },
      ],
      [{ total: 1 }],
    );
    const result = await listUpcomingEvents(db, { page: 1, limit: 12 });
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({ title: 'Limpieza de playa', location: null });
    expect(JSON.stringify(result.data)).not.toContain('secret-organizer');
  });
});

describe('education services', () => {
  it('lists published contents with pagination meta', async () => {
    const db = fakeDb(
      [
        {
          slug: 'tortugas',
          title: 'Tortugas marinas',
          type: 'article',
          body: 'Texto',
          media_url: null,
          cover_url: null,
          category_slug: 'fauna',
          category_name: 'Fauna',
          published_at: new Date('2026-10-01T00:00:00Z'),
          author_id: 'secret-author',
        },
      ],
      [{ total: 1 }],
    );
    const result = await listEduContents(db, { page: 1, limit: 12 });
    expect(result.data[0]).toMatchObject({ slug: 'tortugas', category: { slug: 'fauna' } });
    expect(JSON.stringify(result.data)).not.toContain('secret-author');
  });

  it('lists education categories', async () => {
    const db = fakeDb([{ id: 1, name: 'Fauna', slug: 'fauna' }]);
    expect((await listEduCategories(db)).data).toEqual([{ name: 'Fauna', slug: 'fauna' }]);
  });
});

describe('listDestinationCategories', () => {
  it('returns only name and slug', async () => {
    const db = fakeDb([{ id: 1, name: 'Playas', slug: 'playa' }]);
    expect((await listDestinationCategories(db)).data).toEqual([{ name: 'Playas', slug: 'playa' }]);
  });
});
