import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  createTokenService,
  generateOpaqueToken,
  hashToken,
} from '../../src/services/tokenService.js';

const secret = 'unit-test-secret-with-enough-length-0123456789';
const user = { id: '11111111-1111-1111-1111-111111111111', role: 'authority', area_id: 7 };
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('access tokens', () => {
  const tokens = createTokenService({ secret });

  it('round-trips subject, role and area', async () => {
    const jwt = await tokens.signAccessToken(user);
    expect(await tokens.verifyAccessToken(jwt)).toEqual({
      id: user.id,
      role: 'authority',
      areaId: 7,
    });
  });

  it('is HS256 and lives 15 minutes by default', async () => {
    const jwt = await tokens.signAccessToken(user);
    const [header, payload] = jwt.split('.').slice(0, 2).map(decode);
    expect(header.alg).toBe('HS256');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('rejects tampered, foreign-secret, expired and alg=none tokens', async () => {
    const jwt = await tokens.signAccessToken(user);
    expect(await tokens.verifyAccessToken(`${jwt}x`)).toBeNull();
    const other = createTokenService({ secret: 'another-secret-another-secret-another-0000' });
    expect(await other.verifyAccessToken(jwt)).toBeNull();
    const expired = await createTokenService({ secret, ttlSeconds: -10 }).signAccessToken(user);
    expect(await tokens.verifyAccessToken(expired)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${jwt.split('.')[1]}.`;
    expect(await tokens.verifyAccessToken(none)).toBeNull();
    expect(await tokens.verifyAccessToken('garbage')).toBeNull();
  });

  it('rejects tokens meant for another audience', async () => {
    const forged = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('tudestino-api')
      .setAudience('someone-else')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    expect(await tokens.verifyAccessToken(forged)).toBeNull();
  });
});

describe('opaque tokens', () => {
  it('has 256 bits of entropy and a SHA-256 hash', () => {
    const { token, hash } = generateOpaqueToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(generateOpaqueToken().token).not.toBe(token);
  });
});
