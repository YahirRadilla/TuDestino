// Pure geographic helpers for the map feature (no Leaflet, no DOM).

// Centre of Baja California Sur: where the map opens when there is nothing else to show.
export const BCS_CENTER = Object.freeze({ lat: 24.14, lng: -110.31 });
export const DEFAULT_ZOOM = 8;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function isValidCoordinate(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return (
    point?.lat !== '' &&
    point?.lng !== '' &&
    point?.lat != null &&
    point?.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

// Great-circle distance in kilometres (haversine).
export function distanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

// Adds `distanceKm` to every item with a position and sorts the nearest first.
export function sortByDistance(items, origin) {
  return items
    .map((item) => ({ ...item, distanceKm: distanceKm(origin, item.position) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.title.localeCompare(b.title, 'es'));
}
