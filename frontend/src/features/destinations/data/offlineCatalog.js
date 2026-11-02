import { CachedData } from '../../../shared/hooks/useRemoteData.js';
import { readMirror, readMirrorItem } from '../../../storage/catalogCache.js';
import { STORES } from '../../../storage/db.js';
import { toDestination } from '../api/destinationsApi.js';
import { filterDestinations, findLocalDestination, findLocalDestinations } from './localCatalog.js';

// Fallbacks for useRemoteData: the device mirror (IndexedDB) first, bundled samples last.

export async function loadDestinationsOffline(filters) {
  const { items, syncedAt } = await readMirror(STORES.destinations);
  if (items.length === 0) return findLocalDestinations(filters);
  return new CachedData(filterDestinations(items.map(toDestination), filters), syncedAt);
}

export async function loadDestinationOffline(slug) {
  const cached = await readMirrorItem(STORES.destinations, slug);
  if (cached) return new CachedData(toDestination(cached.item), cached.syncedAt);
  return findLocalDestination(slug);
}
