import { z } from 'zod';
import { paginationShape, searchText, slug } from './common.js';

const COORDINATES = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

const near = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const match = COORDINATES.exec(value);
    const lat = match ? Number(match[1]) : NaN;
    const lng = match ? Number(match[2]) : NaN;
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Usa el formato near=lat,lng con coordenadas válidas.',
      });
      return z.NEVER;
    }
    return { lat, lng };
  });

export const listDestinationsQuery = z.object({
  ...paginationShape,
  category: slug.optional(),
  q: searchText,
  near: near.optional(),
});

export const slugParams = z.object({ slug });
