import { z } from 'zod';

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 12;

export const paginationShape = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
};

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);

export const searchText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);
