import { z } from 'zod';
import { paginationShape, searchText, slug } from './common.js';

export const listEduContentsQuery = z.object({
  ...paginationShape,
  category: slug.optional(),
  type: z.enum(['article', 'video', 'link']).optional(),
  q: searchText,
});
