import { enqueueReport } from '../storage/outbox.js';

export const UUID_A = '7d1f3b0a-6a0e-4a52-9d39-1b0f6f3b9a11';
export const UUID_B = '0c6a2f1e-1c4b-4a8e-b6a3-5f4f2b5d9e22';

export const reportPayload = (overrides = {}) => ({
  type: 'contaminacion',
  description: 'Basura acumulada en la orilla de la playa.',
  lat: 24.1426,
  lng: -110.3128,
  accuracy_m: 12,
  destination_slug: null,
  anonymous: true,
  ...overrides,
});

// jsdom's File is not Node's: build it through the same constructor the code under test uses.
export const photoFile = (name = 'foto.jpg', type = 'image/jpeg', bytes = 8) =>
  new File([new Uint8Array(bytes).fill(7)], name, { type });

export const queueReport = (overrides = {}) =>
  enqueueReport({
    clientUuid: UUID_A,
    payload: reportPayload(),
    photos: [],
    needsSession: false,
    ...overrides,
  });

export const sentReceipt = (overrides = {}) => ({
  folio: 'TD-2026-000042',
  trackingCode: 'ABCDE23456',
  replayed: false,
  sentAt: 1_000,
  ...overrides,
});
