import { CachedData } from '../../../shared/hooks/useRemoteData.js';
import { readMirror, readMirrorItem } from '../../../storage/catalogCache.js';
import { STORES } from '../../../storage/db.js';
import { isEnded } from '../eventTime.js';

// Fallbacks for useRemoteData: events saved on this device. Finished events are not "upcoming".

export async function loadEventsOffline(now = new Date()) {
  const { items, syncedAt } = await readMirror(STORES.events);
  if (items.length === 0) return undefined;
  const upcoming = items
    .filter((event) => !isEnded(event, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return new CachedData(upcoming, syncedAt);
}

// undefined = never saved on this device (the original network error is shown).
export async function loadEventOffline(id) {
  const cached = await readMirrorItem(STORES.events, id);
  return cached ? new CachedData(cached.item, cached.syncedAt) : undefined;
}
