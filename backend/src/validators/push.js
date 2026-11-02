import { z } from 'zod';
import { MAX_LIMIT } from './common.js';
import { isFolio, normalizeFolio, normalizeTrackingCode } from '../services/trackingCode.js';

export const MAX_ENDPOINT_LENGTH = 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const hostAllowed = (hostname, allowedHosts) =>
  !allowedHosts ||
  allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));

// https only, no credentials, bounded size. With an allowlist (production) the host must belong to
// a known push service: the API will POST to this URL, so it must not be an arbitrary target.
export const endpointField = (allowedHosts = null) =>
  z
    .string()
    .max(MAX_ENDPOINT_LENGTH)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          hostAllowed(url.hostname.toLowerCase(), allowedHosts)
        );
      } catch {
        return false;
      }
    }, 'endpoint inválido');

export const createSubscribeBody = (allowedHosts) =>
  z.strictObject({
    endpoint: endpointField(allowedHosts),
    expirationTime: z.number().nullable().optional(),
    keys: z.strictObject({
      p256dh: z.string().regex(BASE64URL).min(80).max(128),
      auth: z.string().regex(BASE64URL).min(16).max(64),
    }),
  });

// Removing a subscription requires its `auth` secret: only the device that owns it knows it.
export const unsubscribeBody = z.strictObject({
  endpoint: z.string().max(MAX_ENDPOINT_LENGTH),
  auth: z.string().regex(BASE64URL).min(16).max(64),
});

export const createFollowBody = (allowedHosts) =>
  z.strictObject({
    folio: z
      .string()
      .max(40)
      .transform(normalizeFolio)
      .refine(isFolio, { message: 'folio inválido' }),
    tracking_code: z
      .string()
      .max(40)
      .transform(normalizeTrackingCode)
      .refine((value) => value.length >= 6, { message: 'código inválido' }),
    endpoint: endpointField(allowedHosts),
  });

export const notificationIdParams = z.object({
  id: z.string().regex(/^[1-9]\d{0,17}$/, 'id inválido'),
});

export const listNotificationsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  unread: z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .default(false),
});
