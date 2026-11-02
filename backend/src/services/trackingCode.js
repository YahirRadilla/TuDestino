import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Crockford-style base32 without the ambiguous I, L, O, U, 0 and 1.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TRACKING_CODE_LENGTH = 10;
const FOLIO_PATTERN = /^TD-\d{4}-\d{6}$/;

// Rejection sampling keeps the distribution uniform: 240 is the largest multiple of 30 below 256.
export function generateTrackingCode(length = TRACKING_CODE_LENGTH) {
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 240 && code.length < length) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

// Users type the code by hand: tolerate case, spaces and dashes.
export const normalizeTrackingCode = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');

export const normalizeFolio = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase();

export const isFolio = (value) => FOLIO_PATTERN.test(value);

export const hashTrackingCode = (code) =>
  createHash('sha256').update(normalizeTrackingCode(code)).digest('hex');

// Constant-time comparison of two hex SHA-256 digests.
export function hashesMatch(expectedHex, candidateHex) {
  const a = Buffer.from(String(expectedHex ?? ''), 'hex');
  const b = Buffer.from(String(candidateHex ?? ''), 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
