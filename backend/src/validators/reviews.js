import { z } from 'zod';
import { paginationShape } from './common.js';

export const MAX_COMMENT_LENGTH = 1000;

// strictObject: unknown keys (e.g. user_id, destination_id) are rejected instead of silently ignored.
export const reviewBody = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT_LENGTH)
    .nullish()
    .transform((value) => value || null),
});

export const listReviewsQuery = z.object({ ...paginationShape });
