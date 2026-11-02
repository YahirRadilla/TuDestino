import { normalizeText } from '../../../shared/utils/share.js';
import { DESTINATIONS, getDestinationBySlug } from './seed.js';

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Haversine distance; accurate enough to sort sample destinations when the API is unavailable.
export function distanceBetweenKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Offline counterpart of GET /destinations: same filters (category, accent-insensitive text,
// "near me" by Haversine distance) computed locally on UI-model destinations. It runs over the
// IndexedDB mirror when there is one and over the bundled samples otherwise.
export function filterDestinations(destinations, { category, q, near } = {}) {
  const needle = normalizeText(q ?? '');
  let result = destinations.filter(
    (d) =>
      (!category || d.categories.includes(category)) &&
      (!needle ||
        normalizeText(`${d.name} ${d.location} ${d.summary} ${d.tag} ${d.description ?? ''}`).includes(
          needle,
        )),
  );
  if (near) {
    result = result
      .map((d) => ({ ...d, distanceKm: Math.round(distanceBetweenKm(near, d.coords) * 10) / 10 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }
  return result;
}

export const findLocalDestinations = (filters = {}) => filterDestinations(DESTINATIONS, filters);

export const findLocalDestination = (slug) => getDestinationBySlug(slug) ?? null;
