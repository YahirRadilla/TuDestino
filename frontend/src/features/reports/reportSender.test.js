import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client.js';
import { apiError, json, stubApi } from '../../test/apiStub.js';
import { buildReportFormData, classifyError, occurredAtFor, sendReport } from './reportSender.js';

const NOW = 1_800_000_000_000;

const entry = (overrides = {}) => ({
  clientUuid: '7d1f3b0a-6a0e-4a52-9d39-1b0f6f3b9a11',
  createdAt: NOW - 1000,
  payload: {
    type: 'tortuga-anidando',
    description: 'Una tortuga anida cerca de la palapa.',
    lat: 24.1426,
    lng: -110.3128,
    accuracy_m: 9,
    destination_slug: 'playa-balandra',
    anonymous: true,
  },
  photos: [{ name: 'a.jpg', type: 'image/jpeg', data: new Uint8Array([1, 2, 3]).buffer }],
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('buildReportFormData', () => {
  it('maps the entry to the API fields, with photos under "photos"', () => {
    const form = buildReportFormData(entry(), NOW);
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'photos'))).toEqual({
      client_uuid: '7d1f3b0a-6a0e-4a52-9d39-1b0f6f3b9a11',
      type: 'tortuga-anidando',
      description: 'Una tortuga anida cerca de la palapa.',
      lat: '24.1426',
      lng: '-110.3128',
      anonymous: 'true',
      accuracy_m: '9',
      destination_slug: 'playa-balandra',
    });
    const photos = form.getAll('photos');
    expect(photos).toHaveLength(1);
    expect(photos[0].name).toBe('a.jpg');
    expect(photos[0].type).toBe('image/jpeg');
    expect(photos[0].size).toBe(3);
  });

  it('omits optional fields that were not provided', () => {
    const form = buildReportFormData(
      entry({
        photos: [],
        payload: { ...entry().payload, accuracy_m: null, destination_slug: null, anonymous: false },
      }),
      NOW,
    );
    expect(form.has('accuracy_m')).toBe(false);
    expect(form.has('destination_slug')).toBe(false);
    expect(form.has('occurred_at')).toBe(false);
    expect(form.get('anonymous')).toBe('false');
    expect(form.getAll('photos')).toEqual([]);
  });

  it('sends the original time only for a report that was delayed', () => {
    expect(occurredAtFor(entry({ createdAt: NOW - 30_000 }), NOW)).toBeUndefined();
    const delayed = entry({ createdAt: NOW - 3 * 3600_000 });
    expect(occurredAtFor(delayed, NOW)).toBe(new Date(NOW - 3 * 3600_000).toISOString());
    expect(buildReportFormData(delayed, NOW).get('occurred_at')).toBe(
      new Date(NOW - 3 * 3600_000).toISOString(),
    );
  });

  it('never sends a time in the future (clock skew)', () => {
    const skewed = entry({ createdAt: NOW + 10 * 60_000 });
    // The entry is "in the future" relative to now: it is not delayed, so no time is sent.
    expect(occurredAtFor(skewed, NOW)).toBeUndefined();
  });
});

describe('classifyError', () => {
  it.each([
    ['offline', undefined],
    ['network', undefined],
    ['timeout', undefined],
    ['aborted', undefined],
  ])('retries a %s failure', (kind) => {
    expect(classifyError(new ApiError(kind, 'x'))).toMatchObject({ outcome: 'retry', kind });
  });

  it.each([408, 409, 429, 500, 502, 503])('retries HTTP %i', (status) => {
    expect(classifyError(new ApiError('http', 'x', { status }))).toMatchObject({ outcome: 'retry' });
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [401, 'UNAUTHORIZED'],
  ])('marks HTTP %i as failed with its reason', (status, code) => {
    expect(classifyError(new ApiError('http', 'Motivo.', { status, code }))).toEqual({
      outcome: 'failed',
      reason: 'Motivo.',
      code,
    });
  });

  it('retries on anything unexpected rather than dropping a report', () => {
    expect(classifyError(new Error('boom')).outcome).toBe('retry');
  });
});

describe('sendReport', () => {
  const created = { data: { folio: 'TD-2026-000001', tracking_code: 'ABCDE23456', replayed: false } };

  it('posts multipart without a JSON content type and returns the receipt', async () => {
    const api = stubApi({ 'POST /reports': () => json(created, 201) });
    const result = await sendReport(entry(), { now: () => NOW });
    expect(result).toEqual({
      outcome: 'sent',
      receipt: { folio: 'TD-2026-000001', trackingCode: 'ABCDE23456', replayed: false, sentAt: NOW },
    });
    const [, init] = api.fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(api.calls[0].authorization).toBeUndefined();
  });

  it('treats the 200 replay of an earlier delivery as delivered (idempotency)', async () => {
    stubApi({
      'POST /reports': json({ data: { folio: 'TD-2026-000001', tracking_code: null, replayed: true } }),
    });
    const result = await sendReport(entry(), { now: () => NOW });
    expect(result).toMatchObject({
      outcome: 'sent',
      receipt: { folio: 'TD-2026-000001', trackingCode: null, replayed: true },
    });
  });

  it('fails (no retry) on a validation or media-type refusal, keeping the reason', async () => {
    stubApi({
      'POST /reports': apiError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Solo se aceptan fotos JPEG, PNG o WebP válidas.',
      ),
    });
    expect(await sendReport(entry())).toEqual({
      outcome: 'failed',
      reason: 'Solo se aceptan fotos JPEG, PNG o WebP válidas.',
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    stubApi({ 'POST /reports': apiError(400, 'VALIDATION_ERROR', 'description: demasiado corta') });
    expect((await sendReport(entry())).outcome).toBe('failed');
  });

  it('retries on 5xx and on 429', async () => {
    stubApi({ 'POST /reports': apiError(503, 'INTERNAL_ERROR', 'Error interno.') });
    expect((await sendReport(entry())).outcome).toBe('retry');
    stubApi({ 'POST /reports': apiError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.') });
    expect((await sendReport(entry())).outcome).toBe('retry');
  });

  it('retries when the network is down, and when the device says it is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await sendReport(entry())).toMatchObject({ outcome: 'retry', kind: 'network' });
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect(await sendReport(entry())).toMatchObject({ outcome: 'retry', kind: 'offline' });
  });

  it('retries a 2xx that does not look like a report receipt', async () => {
    stubApi({ 'POST /reports': json({ ok: true }) });
    expect((await sendReport(entry())).outcome).toBe('retry');
  });

  it('never attaches the session to an anonymous report, even from the page', async () => {
    const fetcher = vi.fn().mockResolvedValue(created);
    await sendReport(entry(), { fetcher });
    expect(fetcher.mock.calls[0][1].auth).toBe(false);
    const linked = entry({ payload: { ...entry().payload, anonymous: false } });
    await sendReport(linked, { fetcher });
    expect(fetcher.mock.calls[1][1].auth).toBe('optional');
  });
});
