import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, stubApi } from '../../../test/apiStub.js';
import { STORES, getAll } from '../../../storage/db.js';
import { readMirror } from '../../../storage/catalogCache.js';
import { getFavoritesSnapshot, hydrateFavorites, setLocalFavorite } from '../../../storage/favoritesStore.js';
import { syncFavoritesWithServer, toggleFavorite } from './favoritesSync.js';

afterEach(() => vi.unstubAllGlobals());

const item = (slug) => ({
  id: slug,
  slug,
  name: slug,
  summary: '',
  category: { slug: 'playa', name: 'Playas' },
  location: { lat: 1, lng: 2 },
  images: [],
  favorited_at: '2026-10-01T00:00:00Z',
});
const list = (...slugs) => ({
  data: slugs.map(item),
  meta: { page: 1, limit: 50, total: slugs.length, total_pages: 1 },
});
const stored = async () => (await getAll(STORES.favorites)).map((row) => row.slug).sort();

describe('toggleFavorite', () => {
  it('anonymous: stays on the device and never calls the API', async () => {
    const api = stubApi({});
    expect(await toggleFavorite('balandra', { authenticated: false })).toBe(true);
    expect(getFavoritesSnapshot().ids).toEqual(['balandra']);
    expect(await stored()).toEqual(['balandra']);
    expect(await toggleFavorite('balandra', { authenticated: false })).toBe(false);
    expect(getFavoritesSnapshot().ids).toEqual([]);
    expect(api.calls).toHaveLength(0);
  });

  it('signed in: flips at once, then tells the server (PUT then DELETE)', async () => {
    const api = stubApi({
      'PUT /me/favorites/balandra': { data: { slug: 'balandra', favorited: true } },
      'DELETE /me/favorites/balandra': { data: { slug: 'balandra', favorited: false } },
    });
    const pending = toggleFavorite('balandra', { authenticated: true });
    await vi.waitFor(() => expect(getFavoritesSnapshot().ids).toEqual(['balandra']));
    await pending;
    await toggleFavorite('balandra', { authenticated: true });
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'PUT /me/favorites/balandra',
      'DELETE /me/favorites/balandra',
    ]);
    expect(getFavoritesSnapshot().ids).toEqual([]);
  });

  it('rolls back the heart and rethrows when the server refuses', async () => {
    stubApi({ 'PUT /me/favorites/balandra': apiError(500, 'INTERNAL_ERROR', 'Error') });
    await expect(toggleFavorite('balandra', { authenticated: true })).rejects.toMatchObject({ status: 500 });
    expect(getFavoritesSnapshot().ids).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it('rolls back an un-favorite too', async () => {
    stubApi({ 'DELETE /me/favorites/balandra': apiError(500, 'INTERNAL_ERROR', 'Error') });
    await hydrateFavorites();
    await setLocalFavorite('balandra', true);
    await expect(toggleFavorite('balandra', { authenticated: true })).rejects.toBeTruthy();
    expect(getFavoritesSnapshot().ids).toEqual(['balandra']);
    expect(await stored()).toEqual(['balandra']);
  });

  it('rolls back when offline (the request never leaves the device)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(toggleFavorite('balandra', { authenticated: true })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(getFavoritesSnapshot().ids).toEqual([]);
  });

  it('ignores a second toggle of the same destination while one is in flight', async () => {
    let release;
    const api = stubApi({
      'PUT /me/favorites/balandra': () =>
        new Promise((resolve) => {
          release = () => resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }));
        }),
    });
    const first = toggleFavorite('balandra', { authenticated: true });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const second = await toggleFavorite('balandra', { authenticated: true });
    expect(second).toBe(true); // unchanged state, no second request
    release();
    await first;
    expect(api.calls).toHaveLength(1);
  });
});

describe('syncFavoritesWithServer', () => {
  it('pushes local-only favorites without duplicating the ones the server already has', async () => {
    const api = stubApi({
      'GET /me/favorites': list('balandra', 'cabo-pulmo'),
      'PUT /me/favorites/espiritu-santo': { data: {} },
    });
    await hydrateFavorites();
    await setLocalFavorite('balandra', true);
    await setLocalFavorite('espiritu-santo', true);
    await syncFavoritesWithServer();

    const puts = api.calls.filter((c) => c.method === 'PUT').map((c) => c.path);
    expect(puts).toEqual(['/me/favorites/espiritu-santo']);
    expect([...getFavoritesSnapshot().ids].sort()).toEqual(['balandra', 'cabo-pulmo', 'espiritu-santo']);
    expect(await stored()).toEqual(['balandra', 'cabo-pulmo', 'espiritu-santo']);
  });

  it('adopts the server list and mirrors its destinations for offline use', async () => {
    stubApi({ 'GET /me/favorites': list('balandra') });
    await syncFavoritesWithServer();
    expect(getFavoritesSnapshot().ids).toEqual(['balandra']);
    await vi.waitFor(async () =>
      expect((await readMirror(STORES.destinations)).items.map((d) => d.slug)).toEqual(['balandra']),
    );
    expect((await readMirror(STORES.destinations)).items[0]).not.toHaveProperty('favorited_at');
  });

  it('drops a local favorite whose destination no longer exists (404) and keeps going', async () => {
    stubApi({
      'GET /me/favorites': list(),
      'PUT /me/favorites/fantasma': apiError(404, 'NOT_FOUND', 'No existe'),
      'PUT /me/favorites/balandra': { data: {} },
    });
    await hydrateFavorites();
    await setLocalFavorite('fantasma', true);
    await setLocalFavorite('balandra', true);
    await syncFavoritesWithServer();
    expect(getFavoritesSnapshot().ids).toEqual(['balandra']);
  });

  it('leaves the local list untouched when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await hydrateFavorites();
    await setLocalFavorite('balandra', true);
    await expect(syncFavoritesWithServer()).rejects.toMatchObject({ kind: 'network' });
    expect(getFavoritesSnapshot().ids).toEqual(['balandra']);
  });
});
