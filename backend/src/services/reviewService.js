import * as destinations from '../models/destinationModel.js';
import * as reviews from '../models/reviewModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Destino no encontrado.');

// The author is never part of the public shape.
const toReview = (row) => ({
  id: row.id,
  rating: row.rating,
  comment: row.comment,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function listDestinationReviews(db, slug, query) {
  const destinationId = await destinations.findPublishedId(db, slug);
  if (!destinationId) throw notFound();
  const [rows, total] = await Promise.all([
    reviews.findByDestination(db, destinationId, { limit: query.limit, offset: offsetOf(query) }),
    reviews.countByDestination(db, destinationId),
  ]);
  return { data: rows.map(toReview), meta: buildMeta(query, total) };
}

// Runs the write and the counter recompute in one transaction, holding the destination row lock.
async function writeReview(db, slug, write) {
  return withTransaction(db, async (client) => {
    const destinationId = await destinations.lockBySlug(client, slug);
    if (!destinationId) throw notFound();
    const outcome = await write(client, destinationId);
    if (!outcome) return null;
    const totals = await reviews.recomputeDestinationRating(client, destinationId);
    return { ...outcome, totals };
  });
}

const toWriteResult = ({ review, totals }) => ({
  data: toReview(review),
  meta: { avg_rating: totals.avg_rating, reviews_count: totals.reviews_count },
});

export async function createReview(db, slug, userId, { rating, comment }) {
  const result = await writeReview(db, slug, async (client, destinationId) => {
    const review = await reviews.insertIfAbsent(client, { destinationId, userId, rating, comment });
    return review && { review };
  });
  if (!result) {
    throw new HttpError(409, 'REVIEW_EXISTS', 'Ya reseñaste este destino. Edita tu reseña.');
  }
  return toWriteResult(result);
}

// Creates or replaces the caller's review. `created` tells the controller to answer 201 vs 200.
export async function saveMyReview(db, slug, userId, { rating, comment }) {
  const result = await writeReview(db, slug, async (client, destinationId) => {
    const row = await reviews.upsert(client, { destinationId, userId, rating, comment });
    return { review: row, created: row.inserted };
  });
  return { ...toWriteResult(result), created: result.created };
}

export async function listMyReviews(db, userId, query) {
  const [rows, total] = await Promise.all([
    reviews.findByUser(db, userId, { limit: query.limit, offset: offsetOf(query) }),
    reviews.countByUser(db, userId),
  ]);
  return {
    data: rows.map((row) => ({
      ...toReview(row),
      destination: { slug: row.destination_slug, name: row.destination_name },
    })),
    meta: buildMeta(query, total),
  };
}
