import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTokenService } from '../../src/services/tokenService.js';

export const TEST_SECRET = 'unit-test-secret-with-enough-length-0123456789';
export const CLIENT_ORIGIN = 'http://localhost:5173';
export const USER_ID = '7d1f3b0a-6a0e-4a52-9d39-1b0f6f3b9a11';

const tokens = createTokenService({ secret: TEST_SECRET });

export const bearerFor = async (overrides = {}) =>
  `Bearer ${await tokens.signAccessToken({ id: USER_ID, role: 'user', area_id: null, ...overrides })}`;

// An app wired like production (auth enabled) on top of a scripted database.
export function createAuthedApp(db, extra = {}) {
  return createApp({
    clientOrigin: CLIENT_ORIGIN,
    db,
    rateLimitPerMinute: 10_000,
    auth: {
      jwtSecret: TEST_SECRET,
      bcryptRounds: 4,
      refreshTtlSeconds: 3600,
      cookieSecure: true,
      mailer: { sendPasswordReset: vi.fn() },
      ...extra,
    },
  });
}
