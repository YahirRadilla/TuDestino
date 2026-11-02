import { describe, expect, it } from 'vitest';
import {
  createFollowBody,
  createSubscribeBody,
  listNotificationsQuery,
  notificationIdParams,
  unsubscribeBody,
} from '../../src/validators/push.js';
import { loadConfig, DEV_VAPID_KEYS } from '../../src/config/env.js';

const P256DH = 'B'.repeat(87);
const AUTH = 'a'.repeat(22);
const valid = (overrides = {}) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: P256DH, auth: AUTH },
  ...overrides,
});

describe('createSubscribeBody', () => {
  const schema = createSubscribeBody(null);

  it('accepts what PushSubscription.toJSON() produces', () => {
    expect(schema.safeParse(valid({ expirationTime: null })).success).toBe(true);
  });

  it.each([
    ['http endpoint', { endpoint: 'http://push.example.com/x' }],
    ['no scheme', { endpoint: 'push.example.com/x' }],
    ['embedded credentials', { endpoint: 'https://user:pw@push.example.com/x' }],
    ['huge endpoint', { endpoint: `https://push.example.com/${'a'.repeat(2000)}` }],
    ['short auth', { keys: { p256dh: P256DH, auth: 'abc' } }],
    ['non base64url key', { keys: { p256dh: `${'B'.repeat(86)}!`, auth: AUTH } }],
  ])('rejects %s', (_label, overrides) => {
    expect(schema.safeParse(valid(overrides)).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(schema.safeParse(valid({ user_id: 'x' })).success).toBe(false);
  });

  it('restricts the host to the allowlist when one is configured', () => {
    const strict = createSubscribeBody(['fcm.googleapis.com']);
    expect(strict.safeParse(valid()).success).toBe(true);
    expect(strict.safeParse(valid({ endpoint: 'https://evil.example.com/x' })).success).toBe(false);
    expect(
      strict.safeParse(valid({ endpoint: 'https://fcm.googleapis.com.evil.com/x' })).success,
    ).toBe(false);
    expect(strict.safeParse(valid({ endpoint: 'https://sub.fcm.googleapis.com/x' })).success).toBe(
      true,
    );
  });
});

describe('unsubscribeBody', () => {
  it('requires the auth secret', () => {
    expect(unsubscribeBody.safeParse({ endpoint: 'https://x.example/y' }).success).toBe(false);
    expect(unsubscribeBody.safeParse({ endpoint: 'https://x.example/y', auth: AUTH }).success).toBe(
      true,
    );
  });
});

describe('createFollowBody', () => {
  const schema = createFollowBody(null);
  const body = {
    folio: ' td-2026-000123 ',
    tracking_code: 'abc-def 234',
    endpoint: 'https://push.example.com/x',
  };

  it('normalises the folio and the tracking code like /reports/track', () => {
    const parsed = schema.parse(body);
    expect(parsed.folio).toBe('TD-2026-000123');
    expect(parsed.tracking_code).toBe('ABCDEF234');
  });

  it('rejects a malformed folio or a short code', () => {
    expect(schema.safeParse({ ...body, folio: 'nope' }).success).toBe(false);
    expect(schema.safeParse({ ...body, tracking_code: '123' }).success).toBe(false);
  });
});

describe('inbox validators', () => {
  it('parses the notification id as a positive integer string', () => {
    expect(notificationIdParams.safeParse({ id: '42' }).success).toBe(true);
    expect(notificationIdParams.safeParse({ id: '0' }).success).toBe(false);
    expect(notificationIdParams.safeParse({ id: '1; DROP' }).success).toBe(false);
  });

  it('defaults to page 1, 20 items and all notifications', () => {
    expect(listNotificationsQuery.parse({})).toEqual({ page: 1, limit: 20, unread: false });
    expect(listNotificationsQuery.parse({ unread: 'true' }).unread).toBe(true);
  });
});

describe('VAPID configuration', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://x',
    JWT_SECRET: 'a'.repeat(40),
    SMTP_URL: 'smtp://h',
    CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
  };
  const keys = {
    VAPID_PUBLIC_KEY: DEV_VAPID_KEYS.publicKey,
    VAPID_PRIVATE_KEY: 'Z'.repeat(43),
    VAPID_SUBJECT: 'mailto:ops@example.com',
  };

  it('falls back to fixed development keys outside production', () => {
    const { push } = loadConfig({ NODE_ENV: 'test' });
    expect(push.vapid).toEqual(DEV_VAPID_KEYS);
    expect(push.allowedHosts).toBeNull();
    expect(push.remindersEnabled).toBe(true);
  });

  it('requires your own keys in production', () => {
    expect(() => loadConfig(prod)).toThrow(/VAPID/);
    expect(() =>
      loadConfig({ ...prod, ...keys, VAPID_PRIVATE_KEY: DEV_VAPID_KEYS.privateKey }),
    ).toThrow(/VAPID/);
    const config = loadConfig({ ...prod, ...keys });
    expect(config.push.vapid.subject).toBe('mailto:ops@example.com');
    expect(config.push.allowedHosts).toContain('fcm.googleapis.com');
  });

  it('rejects partial or malformed keys and subjects', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY })).toThrow(
      /van juntas/,
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'test', ...keys, VAPID_SUBJECT: 'ops@example.com' }),
    ).toThrow(/VAPID_SUBJECT/);
    expect(() => loadConfig({ NODE_ENV: 'test', ...keys, VAPID_PUBLIC_KEY: 'short' })).toThrow(
      /VAPID_PUBLIC_KEY/,
    );
  });

  it('accepts an https subject and lets reminders be switched off', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      ...keys,
      VAPID_SUBJECT: 'https://tudestino.example/contacto',
      REMINDERS_ENABLED: 'false',
      PUSH_ALLOWED_HOSTS: 'Push.Example.com, other.test',
    });
    expect(config.push.remindersEnabled).toBe(false);
    expect(config.push.allowedHosts).toEqual(['push.example.com', 'other.test']);
  });
});
