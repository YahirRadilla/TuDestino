import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'tudestino-api';
const AUDIENCE = 'tudestino-web';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Opaque, URL-safe random token (256 bits). Only its SHA-256 is ever persisted.
export function generateOpaqueToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function createTokenService({ secret, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS }) {
  const key = new TextEncoder().encode(secret);

  return {
    ttlSeconds,
    async signAccessToken(user) {
      return new SignJWT({ role: user.role, area: user.area_id ?? null })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key);
    },
    // Returns { id, role, areaId } or null when the token is missing, forged or expired.
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        if (!payload.sub || typeof payload.role !== 'string') return null;
        return { id: payload.sub, role: payload.role, areaId: payload.area ?? null };
      } catch (error) {
        if (error instanceof errors.JOSEError) return null;
        throw error;
      }
    },
  };
}
