import { z } from 'zod';
import { slug } from './common.js';

export const MAP_PINS_MAX = 500;

const NUMBER = /^-?\d+(?:\.\d+)?$/;

// bbox=minLng,minLat,maxLng,maxLat (WGS84, the order Leaflet's toBBoxString() produces).
const bbox = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parts = value.split(',').map((part) => part.trim());
    const [minLng, minLat, maxLng, maxLat] = parts.map((part) =>
      NUMBER.test(part) ? Number(part) : NaN,
    );
    const valid =
      parts.length === 4 &&
      [minLng, maxLng].every((n) => Math.abs(n) <= 180) &&
      [minLat, maxLat].every((n) => Math.abs(n) <= 90) &&
      minLng <= maxLng &&
      minLat <= maxLat;
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'Usa bbox=minLng,minLat,maxLng,maxLat con coordenadas válidas.',
      });
      return z.NEVER;
    }
    return { minLng, minLat, maxLng, maxLat };
  });

const limit = z.coerce.number().int().min(1).max(MAP_PINS_MAX).default(MAP_PINS_MAX);

const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const publicPinsQuery = z.object({
  bbox: z.preprocess(emptyToUndefined, bbox.optional()),
  limit,
});

export const adminPinsQuery = z.object({
  bbox: z.preprocess(emptyToUndefined, bbox.optional()),
  limit,
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['pending', 'in_review', 'resolved', 'dismissed']).optional(),
  ),
  type: z.preprocess(emptyToUndefined, slug.optional()),
});
