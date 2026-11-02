import * as destinations from '../models/destinationModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';

export const toListItem = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  municipality: row.municipality,
  is_protected_area: row.is_protected_area,
  avg_rating: row.avg_rating,
  reviews_count: row.reviews_count,
  category: { slug: row.category_slug, name: row.category_name },
  location: { lat: row.lat, lng: row.lng },
  images: row.images,
  ...(row.distance_km != null && { distance_km: Math.round(row.distance_km * 10) / 10 }),
});

const toDetail = (row) => ({
  ...toListItem(row),
  description: row.description,
  regulations: row.regulations,
  care_tips: row.care_tips,
  highlights: row.highlights,
});

export async function listDestinations(db, query) {
  const { page, limit, category, q, near } = query;
  const [rows, total] = await Promise.all([
    destinations.findPublished(db, { category, q, near, limit, offset: offsetOf(query) }),
    destinations.countPublished(db, { category, q }),
  ]);
  return { data: rows.map(toListItem), meta: buildMeta({ page, limit }, total) };
}

export async function getDestinationBySlug(db, slug) {
  const row = await destinations.findPublishedBySlug(db, slug);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Destino no encontrado.');
  return { data: toDetail(row), meta: {} };
}

export async function listDestinationCategories(db) {
  const rows = await destinations.findCategories(db);
  return { data: rows.map(({ name, slug }) => ({ name, slug })), meta: {} };
}
