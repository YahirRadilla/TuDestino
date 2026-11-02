import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const VAPID = {
  VAPID_PUBLIC_KEY: 'B'.repeat(87),
  VAPID_PRIVATE_KEY: 'k'.repeat(43),
  VAPID_SUBJECT: 'mailto:ops@example.com',
};

describe('loadConfig', () => {
  it('requires DATABASE_URL outside of tests', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });

  it('accepts a missing DATABASE_URL in the test environment', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).databaseUrl).toBeUndefined();
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '99999' })).toThrow(/PORT/);
  });

  it('applies defaults', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({ port: 3000, trustProxy: false });
  });

  it('parses TRUST_PROXY as boolean or number of hops', () => {
    expect(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'true' }).trustProxy).toBe(1);
    expect(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'maybe' })).toThrow(/TRUST_PROXY/);
  });

  it('uses secure cookies only outside development unless overridden', () => {
    const prod = {
      NODE_ENV: 'production',
      ...VAPID,
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: 'a'.repeat(40),
      SMTP_URL: 'smtp://localhost',
      CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
    };
    expect(loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'x' }).auth.cookieSecure).toBe(
      false,
    );
    expect(loadConfig(prod).auth.cookieSecure).toBe(true);
    expect(loadConfig({ ...prod, COOKIE_SECURE: 'false' }).auth.cookieSecure).toBe(false);
  });

  it('requires a strong JWT_SECRET and SMTP_URL in production', () => {
    const base = {
      NODE_ENV: 'production',
      ...VAPID,
      DATABASE_URL: 'postgres://x',
      SMTP_URL: 'smtp://h',
      CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
    };
    expect(() => loadConfig(base)).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, JWT_SECRET: 'change-me' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, JWT_SECRET: 'x'.repeat(40), SMTP_URL: undefined })).toThrow(
      /SMTP_URL/,
    );
  });

  it('selects the evidence storage driver and requires Cloudinary credentials when needed', () => {
    const local = loadConfig({ NODE_ENV: 'test' }).reports;
    expect(local.storage.driver).toBe('local');
    expect(local.storage.uploadsDir).toMatch(/uploads$/);
    expect(local.rateLimit).toEqual({ limit: 10, windowMs: 60 * 60_000 });
    expect(() => loadConfig({ NODE_ENV: 'test', STORAGE_DRIVER: 'cloudinary' })).toThrow(
      /CLOUDINARY_URL/,
    );
    const prod = {
      NODE_ENV: 'production',
      ...VAPID,
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: 'x'.repeat(40),
      SMTP_URL: 'smtp://h',
    };
    expect(() => loadConfig(prod)).toThrow(/CLOUDINARY_URL/);
    expect(loadConfig({ ...prod, STORAGE_DRIVER: 'local' }).reports.storage.driver).toBe('local');
    expect(
      loadConfig({ ...prod, CLOUDINARY_URL: 'cloudinary://k:s@c' }).reports.storage.driver,
    ).toBe('cloudinary');
  });

  it('bounds the refresh token lifetime and bcrypt cost', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', BCRYPT_ROUNDS: '2' })).toThrow(/BCRYPT_ROUNDS/);
    expect(
      loadConfig({ NODE_ENV: 'test', REFRESH_TOKEN_TTL_DAYS: '7' }).auth.refreshTtlSeconds,
    ).toBe(7 * 86400);
  });
});
