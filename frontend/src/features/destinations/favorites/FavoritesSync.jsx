import { useEffect, useRef } from 'react';
import { useSession } from '../../auth/authContext.js';
import { clearLocalFavorites, hydrateFavorites } from '../../../storage/favoritesStore.js';
import { syncFavoritesWithServer } from './favoritesSync.js';

// Renders nothing. Keeps the device favorites and the account in step with the session:
// sign in -> merge + adopt the server list (retried when the connection returns);
// sign out -> forget the account's favorites so the next person on this device starts clean.
export default function FavoritesSync() {
  const { status, user } = useSession();
  const userId = user?.id ?? null;
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    void hydrateFavorites();
  }, []);

  useEffect(() => {
    if (status === 'anonymous' && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      void clearLocalFavorites();
    }
    if (status !== 'authenticated') return undefined;
    wasAuthenticated.current = true;

    let cancelled = false;
    const run = () => {
      syncFavoritesWithServer().catch(() => {
        // Offline or server down: keep the local list and try again on reconnection.
      });
    };
    run();
    const onOnline = () => !cancelled && run();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [status, userId]);

  return null;
}
