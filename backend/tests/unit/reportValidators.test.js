import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createReportBody, trackReportBody } from '../../src/validators/reports.js';

const valid = () => ({
  type: 'tortuga-anidando',
  description: 'Una tortuga está anidando cerca de la palapa.',
  lat: '24.14',
  lng: '-110.31',
  client_uuid: randomUUID(),
});

describe('createReportBody', () => {
  it('coerces multipart strings and defaults to anonymous', () => {
    const parsed = createReportBody.parse(valid());
    expect(parsed.lat).toBe(24.14);
    expect(parsed.lng).toBe(-110.31);
    expect(parsed.anonymous).toBe(true);
    expect(parsed.accuracy_m).toBeUndefined();
  });

  it('parses the anonymous switch strictly', () => {
    expect(createReportBody.parse({ ...valid(), anonymous: 'false' }).anonymous).toBe(false);
    expect(createReportBody.parse({ ...valid(), anonymous: 'true' }).anonymous).toBe(true);
    expect(createReportBody.parse({ ...valid(), anonymous: '' }).anonymous).toBe(true);
    expect(createReportBody.safeParse({ ...valid(), anonymous: 'maybe' }).success).toBe(false);
  });

  it('bounds the description between 10 and 2000 characters after trimming', () => {
    expect(createReportBody.safeParse({ ...valid(), description: '   corta   ' }).success).toBe(
      false,
    );
    expect(createReportBody.safeParse({ ...valid(), description: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    expect(createReportBody.safeParse({ ...valid(), description: 'x'.repeat(2000) }).success).toBe(
      true,
    );
  });

  it.each([
    ['lat', '91'],
    ['lat', '-90.5'],
    ['lng', '181'],
    ['lng', '-180.1'],
    ['lat', ''],
    ['lat', 'abc'],
    ['lng', '1e3'],
  ])('rejects %s=%s', (field, value) => {
    expect(createReportBody.safeParse({ ...valid(), [field]: value }).success).toBe(false);
  });

  it('accepts the extreme valid coordinates', () => {
    expect(createReportBody.safeParse({ ...valid(), lat: '-90', lng: '180' }).success).toBe(true);
  });

  it('treats an empty accuracy as missing and rejects a negative one', () => {
    expect(createReportBody.parse({ ...valid(), accuracy_m: '' }).accuracy_m).toBeUndefined();
    expect(createReportBody.parse({ ...valid(), accuracy_m: '12.5' }).accuracy_m).toBe(12.5);
    expect(createReportBody.safeParse({ ...valid(), accuracy_m: '-1' }).success).toBe(false);
  });

  it('requires a UUID client_uuid and a slug type', () => {
    expect(createReportBody.safeParse({ ...valid(), client_uuid: 'abc' }).success).toBe(false);
    const without = valid();
    delete without.client_uuid;
    expect(createReportBody.safeParse(without).success).toBe(false);
    expect(createReportBody.safeParse({ ...valid(), type: 'No Slug!' }).success).toBe(false);
  });

  it('rejects occurred_at in the future but allows the past', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(createReportBody.safeParse({ ...valid(), occurred_at: future }).success).toBe(false);
    const parsed = createReportBody.parse({ ...valid(), occurred_at: past });
    expect(parsed.occurred_at).toBeInstanceOf(Date);
    expect(createReportBody.safeParse({ ...valid(), occurred_at: 'ayer' }).success).toBe(false);
  });

  it('rejects fields a client must never set', () => {
    for (const field of ['reporter_id', 'status', 'folio', 'tracking_code_hash', 'ip']) {
      expect(createReportBody.safeParse({ ...valid(), [field]: 'x' }).success).toBe(false);
    }
  });
});

describe('trackReportBody', () => {
  it('normalises folio and code typed by hand', () => {
    expect(trackReportBody.parse({ folio: ' td-2026-000007 ', code: 'abcde-23456' })).toEqual({
      folio: 'TD-2026-000007',
      code: 'ABCDE23456',
    });
  });

  it('rejects malformed input', () => {
    expect(trackReportBody.safeParse({ folio: 'nope', code: 'ABCDE23456' }).success).toBe(false);
    expect(trackReportBody.safeParse({ folio: 'TD-2026-000007', code: 'AB' }).success).toBe(false);
    expect(trackReportBody.safeParse({ folio: 'TD-2026-000007' }).success).toBe(false);
    expect(
      trackReportBody.safeParse({ folio: 'TD-2026-000007', code: 'ABCDE23456', extra: 1 }).success,
    ).toBe(false);
  });
});
