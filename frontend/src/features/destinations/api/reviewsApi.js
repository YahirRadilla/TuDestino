import { ApiError, apiFetch } from '../../../api/client.js';

export const MAX_COMMENT_LENGTH = 1000;

const assertList = (payload) => {
  if (!Array.isArray(payload?.data)) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return payload;
};

// Public reviews carry no author: only rating, comment and dates.
// `fresh` revalidates with the server (If-None-Match) instead of trusting the browser's HTTP
// cache, which would otherwise show the list as it was before the user's own write.
export async function fetchReviews(slug, { limit = 5, fresh = false } = {}, signal) {
  const payload = await apiFetch(`/destinations/${encodeURIComponent(slug)}/reviews`, {
    signal,
    params: { limit },
    ...(fresh && { cache: 'no-cache' }),
  });
  assertList(payload);
  return { reviews: payload.data, total: payload.meta?.total ?? payload.data.length };
}

// Creates the caller's review or replaces it. Returns the review and the destination's new totals.
export async function saveMyReview(slug, { rating, comment }) {
  const payload = await apiFetch(`/destinations/${encodeURIComponent(slug)}/reviews/me`, {
    auth: true,
    method: 'PUT',
    body: { rating, comment: comment?.trim() || null },
  });
  if (!payload?.data?.id) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return {
    review: payload.data,
    totals: { rating: payload.meta?.avg_rating, reviews: payload.meta?.reviews_count },
  };
}

// The caller's reviews, newest first, each with its destination { slug, name }.
export async function fetchMyReviews(signal) {
  const payload = await apiFetch('/me/reviews', { auth: true, signal, params: { limit: 50 } });
  return assertList(payload).data;
}
