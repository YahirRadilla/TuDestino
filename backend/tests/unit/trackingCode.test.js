import { describe, expect, it } from 'vitest';
import {
  generateTrackingCode,
  hashesMatch,
  hashTrackingCode,
  isFolio,
  normalizeFolio,
  normalizeTrackingCode,
  TRACKING_CODE_LENGTH,
} from '../../src/services/trackingCode.js';

describe('generateTrackingCode', () => {
  it('has 10 characters from an alphabet without ambiguous symbols', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateTrackingCode();
      expect(code).toHaveLength(TRACKING_CODE_LENGTH);
      expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{10}$/);
    }
  });

  it('does not repeat across many draws', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateTrackingCode()));
    expect(codes.size).toBe(2000);
  });

  it('uses every symbol of the alphabet (uniform enough)', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) for (const ch of generateTrackingCode()) seen.add(ch);
    expect(seen.size).toBe(30);
  });
});

describe('hashing', () => {
  it('stores a SHA-256 hex digest, never the code', () => {
    const hash = hashTrackingCode('ABCDE23456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCDE');
  });

  it('is tolerant to case, spaces and dashes typed by hand', () => {
    expect(normalizeTrackingCode(' abcde-23456 ')).toBe('ABCDE23456');
    expect(hashTrackingCode('abcde 23456')).toBe(hashTrackingCode('ABCDE23456'));
  });

  it('compares digests without leaking length or accepting garbage', () => {
    const hash = hashTrackingCode('ABCDE23456');
    expect(hashesMatch(hash, hashTrackingCode('abcde23456'))).toBe(true);
    expect(hashesMatch(hash, hashTrackingCode('ABCDE23457'))).toBe(false);
    expect(hashesMatch(hash, 'abc')).toBe(false);
    expect(hashesMatch(undefined, hash)).toBe(false);
    expect(hashesMatch('', '')).toBe(false);
  });
});

describe('folio', () => {
  it('validates the TD-YYYY-NNNNNN shape and normalises input', () => {
    expect(isFolio('TD-2026-000123')).toBe(true);
    expect(isFolio('TD-2026-123')).toBe(false);
    expect(isFolio('td-2026-000123')).toBe(false);
    expect(isFolio("TD-2026-000123' OR 1=1")).toBe(false);
    expect(normalizeFolio('  td-2026-000123 ')).toBe('TD-2026-000123');
  });
});
