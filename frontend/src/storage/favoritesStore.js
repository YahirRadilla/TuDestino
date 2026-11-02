import { STORES, getAll, replaceAll } from './db.js';
import { readJSON } from './localStore.js';

// Favorites live in IndexedDB (PWA-05). React needs a synchronous snapshot, so the set is also
// kept in memory: hydrated once from IndexedDB, then every change is written through.
// `td.favorites` (LocalStorage) is the pre-F4 format; it is migrated once and then ignored.
export const LEGACY_FAVORITES_KEY = 'td.favorites';

const listeners = new Set();
let snapshot = Object.freeze({ ids: Object.freeze([]), ready: false });
let hydration = null;

function publish(ids, ready = snapshot.ready) {
  snapshot = Object.freeze({ ids: Object.freeze([...ids]), ready });
  listeners.forEach((listener) => listener());
}

const persist = (ids) =>
  replaceAll(
    STORES.favorites,
    ids.map((slug) => ({ slug, addedAt: new Date().toISOString() })),
  );

export const getFavoritesSnapshot = () => snapshot;

export function subscribeFavorites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function legacyIds() {
  const value = readJSON(LEGACY_FAVORITES_KEY, []);
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
}

// Loads the stored favorites (and migrates the legacy LocalStorage list). Safe to call many times.
export function hydrateFavorites() {
  hydration ??= (async () => {
    const stored = (await getAll(STORES.favorites)).map((row) => row.slug);
    const legacy = legacyIds();
    const merged = [...new Set([...stored, ...legacy])];
    // Anything toggled before hydration finished wins over what was stored.
    const early = snapshot.ids.filter((id) => !merged.includes(id));
    const ids = [...merged, ...early];
    publish(ids, true);
    if (legacy.length || early.length) {
      await persist(ids);
      try {
        localStorage.removeItem(LEGACY_FAVORITES_KEY);
      } catch {
        // Blocked storage: the legacy key is harmless and ignored after this point.
      }
    }
    return snapshot;
  })();
  return hydration;
}

export const hasFavorite = (slug) => snapshot.ids.includes(slug);

// Sets one favorite in memory and IndexedDB. Returns the new membership.
export async function setLocalFavorite(slug, wanted) {
  const ids = snapshot.ids.filter((id) => id !== slug);
  if (wanted) ids.push(slug);
  publish(ids);
  await persist(ids);
  return wanted;
}

// Replaces the whole set (after syncing with the server, or on logout).
export async function replaceLocalFavorites(slugs) {
  const ids = [...new Set(slugs)];
  publish(ids);
  await persist(ids);
}

export const clearLocalFavorites = () => replaceLocalFavorites([]);

export function resetFavoritesStoreForTests() {
  hydration = null;
  snapshot = Object.freeze({ ids: Object.freeze([]), ready: false });
  listeners.clear();
}
