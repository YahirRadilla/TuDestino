import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { fetchDestination, fetchDestinations } from '../api/destinationsApi.js';
import { loadDestinationOffline, loadDestinationsOffline } from '../data/offlineCatalog.js';

export function useDestinations({ category = null, q = '', near = null } = {}) {
  const filters = { category: category ?? undefined, q: q || undefined, near: near ?? undefined };
  return useRemoteData({
    key: JSON.stringify(filters),
    load: (signal) => fetchDestinations(filters, signal),
    fallback: () => loadDestinationsOffline(filters),
  });
}

// data is the destination, or null when it does not exist.
export function useDestination(slug) {
  return useRemoteData({
    key: slug,
    load: (signal) => fetchDestination(slug, signal),
    fallback: () => loadDestinationOffline(slug),
  });
}
