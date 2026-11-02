import { describe, expect, it } from 'vitest';
import { apiError, json, session, stubApi } from '../../../test/apiStub.js';
import { fetchAdminPins, fetchPublicPins } from './mapApi.js';

describe('fetchPublicPins', () => {
  it('turns the API payload into provider-neutral markers', async () => {
    const { calls } = stubApi({
      'GET /map/pins': {
        data: {
          destinations: [
            {
              slug: 'balandra',
              name: 'Playa Balandra',
              avg_rating: 4.8,
              reviews_count: 2,
              category: { slug: 'playa', name: 'Playa' },
              location: { lat: 24.32, lng: -110.32 },
            },
          ],
          reports: [
            {
              id: 'abc',
              type: { slug: 'animal-varado', name: 'Animal varado' },
              month: '2026-08',
              location: { lat: 24.14, lng: -110.315 },
              approximate: true,
            },
          ],
        },
        meta: { truncated: { destinations: false, reports: true } },
      },
    });
    const pins = await fetchPublicPins();
    expect(pins.destinations[0]).toMatchObject({ id: 'd:balandra', href: '/destinos/balandra' });
    expect(pins.reports[0]).toMatchObject({ id: 'r:abc', approximate: true });
    expect(pins.truncated).toBe(true);
    expect(calls[0].authorization).toBeUndefined(); // public: anonymous, cacheable
  });

  it('rejects an unexpected payload', async () => {
    stubApi({ 'GET /map/pins': { data: {} } });
    await expect(fetchPublicPins()).rejects.toMatchObject({ kind: 'http' });
  });
});

describe('fetchAdminPins', () => {
  it('sends the filters and uses the session', async () => {
    const { calls } = stubApi({
      'POST /auth/refresh': session(),
      'GET /admin/map/pins': json({ data: { reports: [] }, meta: { truncated: { reports: false } } }),
    });
    await fetchAdminPins({ status: 'pending', type: '' });
    const call = calls.find((item) => item.path === '/admin/map/pins');
    expect(call.query).toEqual({ status: 'pending' });
  });

  it('surfaces a 403 so the page can explain it', async () => {
    stubApi({ 'GET /admin/map/pins': apiError(403, 'FORBIDDEN', 'No tienes permiso.') });
    await expect(fetchAdminPins({})).rejects.toMatchObject({ status: 403 });
  });
});
