import { ApiError, apiFetch } from '../../../api/client.js';
import { mirrorDestinations } from '../../../storage/catalogCache.js';
import { catalogRevision } from '../../../storage/catalogFreshness.js';

const REGION = 'Baja California Sur';

// A review changes avg_rating/reviews_count. Include the revision in catalog URLs so the browser
// HTTP cache and the service-worker cache miss once after that write.
const freshnessParams = () => {
  const revision = catalogRevision();
  return revision ? { _r: revision } : {};
};

// API payload -> the shape the UI components already consume (see data/seed.js).
// The slug doubles as the stable id so favorites survive switching between API and local data.
export function toDestination(item) {
  return {
    id: item.slug,
    slug: item.slug,
    name: item.name,
    location: `${item.municipality}, ${REGION}`,
    categories: [item.category.slug],
    tag: item.category.name,
    rating: item.avg_rating,
    reviews: item.reviews_count,
    distanceKm: item.distance_km,
    coords: { lat: item.location.lat, lng: item.location.lng },
    summary: item.summary,
    description: item.description ?? item.summary,
    details: item.highlights ?? [],
    care: item.care_tips ?? [],
    images: item.images.map((image) => image.url),
  };
}

const assertPayload = (payload, isValid) => {
  if (!isValid(payload)) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return payload;
};

// Read-through: every successful answer also refreshes the IndexedDB mirror used offline.
// An unfiltered list shorter than the page size is the whole catalog, so it replaces the mirror.
export async function fetchDestinations({ category, q, near, limit = 50 } = {}, signal) {
  const payload = await apiFetch('/destinations', {
    signal,
    params: { category, q, near: near && `${near.lat},${near.lng}`, limit, ...freshnessParams() },
  });
  assertPayload(payload, (p) => Array.isArray(p?.data));
  void mirrorDestinations(payload.data, { complete: !category && !q && payload.data.length < limit });
  return payload.data.map(toDestination);
}

export async function fetchDestination(slug, signal) {
  try {
    const payload = await apiFetch(`/destinations/${encodeURIComponent(slug)}`, {
      signal,
      params: freshnessParams(),
    });
    assertPayload(payload, (p) => p?.data?.slug);
    void mirrorDestinations([payload.data]);
    return toDestination(payload.data);
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 404) return null;
    throw error;
  }
}
