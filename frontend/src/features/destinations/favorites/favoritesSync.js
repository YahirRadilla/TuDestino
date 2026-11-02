import { mirrorDestinations } from '../../../storage/catalogCache.js';
import {
  getFavoritesSnapshot,
  hasFavorite,
  hydrateFavorites,
  replaceLocalFavorites,
  setLocalFavorite,
} from '../../../storage/favoritesStore.js';
import { addFavoriteRemote, fetchMyFavorites, removeFavoriteRemote } from '../api/favoritesApi.js';

const pending = new Set();

export const isFavoritePending = (slug) => pending.has(slug);

/**
 * Toggles a favorite. Anonymous: device only. Signed in: optimistic (the heart flips at once),
 * then the server is told; if that fails the heart goes back and the error is thrown.
 * A second toggle of the same destination while one is in flight is ignored.
 */
export async function toggleFavorite(slug, { authenticated }) {
  if (pending.has(slug)) return hasFavorite(slug);
  await hydrateFavorites();
  const wanted = !hasFavorite(slug);
  pending.add(slug);
  try {
    await setLocalFavorite(slug, wanted);
    if (authenticated) {
      try {
        await (wanted ? addFavoriteRemote(slug) : removeFavoriteRemote(slug));
      } catch (error) {
        await setLocalFavorite(slug, !wanted);
        throw error;
      }
    }
    return wanted;
  } finally {
    pending.delete(slug);
  }
}

/**
 * After signing in: merge what the visitor saved on this device into the account without
 * duplicates, then adopt the server's list as the truth (and mirror its destinations offline).
 * Throws on network errors so the caller can retry when the connection returns.
 */
export async function syncFavoritesWithServer() {
  await hydrateFavorites();
  const server = await fetchMyFavorites();
  const serverSlugs = server.map((item) => item.slug);
  const pushed = [];
  for (const slug of getFavoritesSnapshot().ids) {
    if (serverSlugs.includes(slug)) continue;
    try {
      await addFavoriteRemote(slug);
      pushed.push(slug);
    } catch (error) {
      // A local favorite whose destination no longer exists upstream is simply dropped.
      if (!(error?.kind === 'http' && error.status === 404)) throw error;
    }
  }
  await replaceLocalFavorites([...serverSlugs, ...pushed]);
  void mirrorDestinations(server);
}
