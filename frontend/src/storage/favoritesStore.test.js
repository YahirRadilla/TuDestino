import { describe, expect, it } from 'vitest';
import { STORES, getAll } from './db.js';
import {
  LEGACY_FAVORITES_KEY,
  clearLocalFavorites,
  getFavoritesSnapshot,
  hasFavorite,
  hydrateFavorites,
  replaceLocalFavorites,
  setLocalFavorite,
  subscribeFavorites,
} from './favoritesStore.js';

describe('favorites store', () => {
  it('starts empty and not ready, then hydrates from IndexedDB', async () => {
    expect(getFavoritesSnapshot()).toMatchObject({ ids: [], ready: false });
    await setLocalFavorite('balandra', true);
    expect((await getAll(STORES.favorites)).map((r) => r.slug)).toEqual(['balandra']);
  });

  it('toggles a favorite in memory and persists it', async () => {
    await hydrateFavorites();
    await setLocalFavorite('a', true);
    await setLocalFavorite('b', true);
    await setLocalFavorite('a', false);
    expect(getFavoritesSnapshot().ids).toEqual(['b']);
    expect(hasFavorite('b')).toBe(true);
    expect((await getAll(STORES.favorites)).map((r) => r.slug)).toEqual(['b']);
  });

  it('notifies subscribers and returns a stable snapshot between changes', async () => {
    await hydrateFavorites();
    let calls = 0;
    const unsubscribe = subscribeFavorites(() => (calls += 1));
    const before = getFavoritesSnapshot();
    expect(getFavoritesSnapshot()).toBe(before);
    await setLocalFavorite('a', true);
    expect(calls).toBe(1);
    expect(getFavoritesSnapshot()).not.toBe(before);
    unsubscribe();
    await setLocalFavorite('b', true);
    expect(calls).toBe(1);
  });

  it('migrates the legacy LocalStorage list once, without duplicates', async () => {
    localStorage.setItem(LEGACY_FAVORITES_KEY, JSON.stringify(['a', 'b', 'a', 42]));
    await hydrateFavorites();
    expect(getFavoritesSnapshot()).toMatchObject({ ids: ['a', 'b'], ready: true });
    expect(localStorage.getItem(LEGACY_FAVORITES_KEY)).toBeNull();
    expect((await getAll(STORES.favorites)).map((r) => r.slug).sort()).toEqual(['a', 'b']);
  });

  it('keeps a favorite toggled before hydration finished', async () => {
    const hydrating = hydrateFavorites();
    await setLocalFavorite('early', true);
    await hydrating;
    expect(getFavoritesSnapshot().ids).toContain('early');
  });

  it('replaces and clears the whole set', async () => {
    await hydrateFavorites();
    await replaceLocalFavorites(['x', 'y', 'x']);
    expect(getFavoritesSnapshot().ids).toEqual(['x', 'y']);
    await clearLocalFavorites();
    expect(getFavoritesSnapshot().ids).toEqual([]);
    expect(await getAll(STORES.favorites)).toEqual([]);
  });
});
