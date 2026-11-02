import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSession } from '../../auth/authContext.js';
import {
  getFavoritesSnapshot,
  hydrateFavorites,
  subscribeFavorites,
} from '../../../storage/favoritesStore.js';
import { toggleFavorite } from '../favorites/favoritesSync.js';

// ids are destination slugs. `toggle(slug)` rejects when the server refuses (the heart is rolled back).
export function useFavorites() {
  const { isAuthenticated } = useSession();
  const { ids, ready } = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getFavoritesSnapshot);

  useEffect(() => {
    void hydrateFavorites();
  }, []);

  const isFavorite = useCallback((id) => ids.includes(id), [ids]);
  const toggle = useCallback(
    (slug) => toggleFavorite(slug, { authenticated: isAuthenticated }),
    [isAuthenticated],
  );
  return { ids, ready, isFavorite, toggle };
}
