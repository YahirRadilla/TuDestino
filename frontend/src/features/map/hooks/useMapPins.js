import { CachedData, useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { loadDestinationsOffline } from '../../destinations/data/offlineCatalog.js';
import { fetchAdminPins, fetchPublicPins } from '../api/mapApi.js';
import { catalogDestinationMarker } from '../mapModel.js';

// Offline: destinations come from the IndexedDB mirror the catalog already keeps (or the samples
// bundled with the app). Report pins are not mirrored: they are public aggregates the service
// worker keeps in its own cache, and without it there is simply nothing to show.
async function loadOffline() {
  const local = await loadDestinationsOffline({});
  const cached = local instanceof CachedData;
  const destinations = (cached ? local.data : local).map(catalogDestinationMarker);
  const value = { destinations, reports: [], truncated: false };
  return cached ? new CachedData(value, local.syncedAt) : value;
}

export function useMapPins() {
  return useRemoteData({ key: 'map-pins', load: fetchPublicPins, fallback: loadOffline });
}

// Staff map (network only): a new filter aborts the previous request.
export function useAdminMapPins({ status = '', type = '' } = {}) {
  return useRemoteData({
    key: `admin-map:${status}:${type}`,
    load: (signal) => fetchAdminPins({ status, type }, signal),
  });
}
