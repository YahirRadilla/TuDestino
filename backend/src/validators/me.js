import { z } from 'zod';
import { MAX_LIMIT, paginationShape } from './common.js';

// "Mis ..." lists default to the largest page so a client can mirror them in one request.
const mineShape = {
  ...paginationShape,
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(MAX_LIMIT),
};

export const listMyFavoritesQuery = z.object(mineShape);
export const listMyReviewsQuery = z.object(mineShape);

export const EVENT_SCOPES = ['upcoming', 'past', 'all'];
export const listMyEventsQuery = z.object({
  ...mineShape,
  scope: z.enum(EVENT_SCOPES).default('upcoming'),
});
