import { z } from 'zod';
import { slug } from './common.js';
import { isFolio, normalizeFolio, normalizeTrackingCode } from '../services/trackingCode.js';

export const MIN_DESCRIPTION_LENGTH = 10;
export const MAX_DESCRIPTION_LENGTH = 2000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

// Multipart fields always arrive as strings, and an empty field means "not provided".
const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

const numberField = (min, max) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, 'debe ser un número')
      .transform(Number)
      .pipe(z.number().min(min).max(max)),
  );

const booleanField = z.preprocess(
  emptyToUndefined,
  z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
);

// strictObject: unknown fields (reporter_id, status, folio...) are rejected, never silently ignored.
export const createReportBody = z.strictObject({
  type: slug,
  description: z.string().trim().min(MIN_DESCRIPTION_LENGTH).max(MAX_DESCRIPTION_LENGTH),
  lat: numberField(-90, 90),
  lng: numberField(-180, 180),
  accuracy_m: z.preprocess(emptyToUndefined, numberField(0, 100_000).optional()),
  destination_slug: z.preprocess(emptyToUndefined, slug.optional()),
  occurred_at: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .refine((date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, {
        message: 'no puede ser una fecha futura',
      })
      .optional(),
  ),
  // Anonymity is the safe default: a client must opt out explicitly.
  anonymous: booleanField.transform((value) => value ?? true),
  client_uuid: z.string().uuid(),
});

export const trackReportBody = z.strictObject({
  folio: z
    .string()
    .max(40)
    .transform(normalizeFolio)
    .refine(isFolio, { message: 'folio inválido' }),
  code: z
    .string()
    .max(40)
    .transform(normalizeTrackingCode)
    .refine((value) => value.length >= 6, { message: 'código inválido' }),
});
