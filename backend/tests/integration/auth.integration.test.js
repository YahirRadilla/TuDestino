import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/config/db.js';
import { createMailer } from '../../src/services/mailer.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createAuthenticate, requireArea, requireRole } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const SECRET = 'integration-secret-with-enough-length-0123456789';
const CLIENT_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Segura#2026';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const uniqueEmail = () => `itest-${randomUUID()}@example.com`;

// Requires a migrated and seeded PostgreSQL (see README). Skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)('auth API (PostgreSQL)', () => {
  let pool;
  let app;
  let mailer;
  const tokens = createTokenService({ secret: SECRET });

  const buildApp = (rateLimit = { windowMs: 60_000, limit: 10_000 }) => {
    mailer = createMailer({
      from: 'test@tudestino.local',
      clientOrigin: CLIENT_ORIGIN,
      nodeEnv: 'test',
    });
    return createApp({
      clientOrigin: CLIENT_ORIGIN,
      db: pool,
      rateLimitPerMinute: 10_000,
      auth: {
        jwtSecret: SECRET,
        bcryptRounds: 4,
        refreshTtlSeconds: 3600,
        cookieSecure: true,
        rateLimit,
        mailer,
      },
    });
  };

  const refreshCookieOf = (res) => {
    const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('td_refresh='));
    return header ?? null;
  };
  const cookieValue = (res) => refreshCookieOf(res)?.split(';')[0].split('=')[1];
  const asCookie = (value) => `td_refresh=${value}`;

  async function registerUser(overrides = {}) {
    const body = { full_name: 'Ana Pérez', email: uniqueEmail(), password: PASSWORD, ...overrides };
    const res = await request(app).post('/api/v1/auth/register').send(body);
    return { body, res, refresh: cookieValue(res), access: res.body.data?.access_token };
  }

  beforeAll(() => {
    pool = createPool(process.env.DATABASE_URL);
    app = buildApp();
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE 'itest-%@example.com'`);
    await pool.end();
  });

  describe('register', () => {
    it('creates the account, returns an access token and sets a hardened refresh cookie', async () => {
      const { res, body } = await registerUser();
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        token_type: 'Bearer',
        expires_in: 900,
        user: { email: body.email, full_name: 'Ana Pérez', role: 'user', area_id: null },
      });
      const cookie = refreshCookieOf(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth(;|$)/);
      expect(res.body.data.refresh_token).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    it('stores only the SHA-256 of the refresh token and a bcrypt password hash', async () => {
      const { res, body } = await registerUser();
      const raw = cookieValue(res);
      const tokenRows = await pool.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [
        sha256(raw),
      ]);
      const rawRows = await pool.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [raw]);
      expect(tokenRows.rowCount).toBe(1);
      expect(rawRows.rowCount).toBe(0);
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [
        body.email,
      ]);
      expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
      expect(rows[0].password_hash).not.toContain(PASSWORD);
    });

    it('rejects a duplicate email, case-insensitively, with 409', async () => {
      const { body } = await registerUser();
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...body, email: body.email.toUpperCase() });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it.each([
      ['weak password', { password: 'short' }],
      ['no symbol', { password: 'Contrasena123' }],
      ['invalid email', { email: 'not-an-email' }],
      ['extra role field', { role: 'admin' }],
    ])('answers 400 for %s', async (_label, patch) => {
      const { res } = await registerUser(patch);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('login', () => {
    it('logs in with valid credentials', async () => {
      const { body } = await registerUser();
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toEqual(expect.any(String));
      expect(refreshCookieOf(res)).not.toBeNull();
    });

    it('logs in the seeded development accounts', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ADMIN@dev.tudestino.local', password: 'DevOnly#2026' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('answers identically for a wrong password and an unknown email', async () => {
      const { body } = await registerUser();
      const wrong = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: 'Incorrecta#1' });
      const unknown = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: 'Incorrecta#1' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(refreshCookieOf(wrong)).toBeNull();
    });

    it('does not let deactivated accounts in', async () => {
      const { body } = await registerUser();
      await pool.query('UPDATE users SET is_active = false WHERE email = $1', [body.email]);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('profile (/me)', () => {
    it('requires a valid bearer token', async () => {
      const none = await request(app).get('/api/v1/me');
      expect(none.status).toBe(401);
      expect(none.body.error.code).toBe('UNAUTHORIZED');
      const bad = await request(app).get('/api/v1/me').set('Authorization', 'Bearer nope');
      expect(bad.status).toBe(401);
    });

    it('rejects an expired access token', async () => {
      const { res } = await registerUser();
      const expired = await createTokenService({ secret: SECRET, ttlSeconds: -30 }).signAccessToken(
        {
          id: res.body.data.user.id,
          role: 'user',
          area_id: null,
        },
      );
      const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${expired}`);
      expect(me.status).toBe(401);
    });

    it('returns the profile without hash or internal fields', async () => {
      const { access, body } = await registerUser();
      const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${access}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['area_id', 'avatar_url', 'created_at', 'email', 'full_name', 'id', 'role'].sort(),
      );
      expect(res.body.data.email).toBe(body.email);
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash|is_active/i);
    });

    it('updates name and avatar but never role or email', async () => {
      const { access, body } = await registerUser();
      const auth = { Authorization: `Bearer ${access}` };
      const ok = await request(app)
        .patch('/api/v1/me')
        .set(auth)
        .send({ full_name: 'Ana María', avatar_url: 'https://example.com/a.png' });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({
        full_name: 'Ana María',
        avatar_url: 'https://example.com/a.png',
      });
      const cleared = await request(app).patch('/api/v1/me').set(auth).send({ avatar_url: null });
      expect(cleared.body.data.avatar_url).toBeNull();
      for (const forbidden of [
        { role: 'admin' },
        { email: 'x@y.co' },
        { full_name: 'Ok', role: 'admin' },
        {},
      ]) {
        const res = await request(app).patch('/api/v1/me').set(auth).send(forbidden);
        expect(res.status).toBe(400);
      }
      const after = await pool.query('SELECT role, email::text FROM users WHERE email = $1', [
        body.email,
      ]);
      expect(after.rows[0]).toEqual({ role: 'user', email: body.email });
    });
  });

  describe('RBAC middleware with real tokens', () => {
    const probe = () => {
      const probeApp = express();
      const authenticate = createAuthenticate(tokens);
      probeApp.get('/admin', authenticate, requireRole('authority', 'admin'), (_req, res) =>
        res.json({ ok: true }),
      );
      probeApp.get(
        '/area/:id',
        authenticate,
        requireArea((req) => Number(req.params.id)),
        (_req, res) => res.json({ ok: true }),
      );
      probeApp.use(errorHandler);
      return probeApp;
    };
    const login = async (email) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'DevOnly#2026' });
      return res.body.data.access_token;
    };

    it('401 anonymous, 403 for role user, 200 for authority and admin', async () => {
      const probeApp = probe();
      const user = await login('user@dev.tudestino.local');
      const authority = await login('authority@dev.tudestino.local');
      const admin = await login('admin@dev.tudestino.local');
      expect((await request(probeApp).get('/admin')).status).toBe(401);
      const denied = await request(probeApp).get('/admin').set('Authorization', `Bearer ${user}`);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
      expect(
        (await request(probeApp).get('/admin').set('Authorization', `Bearer ${authority}`)).status,
      ).toBe(200);
      expect(
        (await request(probeApp).get('/admin').set('Authorization', `Bearer ${admin}`)).status,
      ).toBe(200);
    });

    it('authorities only pass inside their own area; admins everywhere', async () => {
      const probeApp = probe();
      const authority = await login('authority@dev.tudestino.local');
      const admin = await login('admin@dev.tudestino.local');
      const { rows } = await pool.query(
        'SELECT area_id::int AS area_id FROM users WHERE email = $1',
        ['authority@dev.tudestino.local'],
      );
      const own = rows[0].area_id;
      const get = (id, token) =>
        request(probeApp).get(`/area/${id}`).set('Authorization', `Bearer ${token}`);
      expect((await get(own, authority)).status).toBe(200);
      expect((await get(own + 1000, authority)).status).toBe(403);
      expect((await get(own + 1000, admin)).status).toBe(200);
    });
  });

  describe('refresh rotation and reuse detection', () => {
    it('rotates the refresh token and returns a working access token', async () => {
      const { refresh } = await registerUser();
      const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', asCookie(refresh));
      expect(res.status).toBe(200);
      const next = cookieValue(res);
      expect(next).toBeTruthy();
      expect(next).not.toBe(refresh);
      const me = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${res.body.data.access_token}`);
      expect(me.status).toBe(200);
    });

    it('rejects a missing cookie with 401 and clears it', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SESSION');
      expect(refreshCookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('revokes the whole family when an already rotated token is reused', async () => {
      const { refresh: first } = await registerUser();
      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', asCookie(first));
      const second = cookieValue(rotated);
      const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', asCookie(first));
      expect(replay.status).toBe(401);
      // The legitimate, newest token is dead too: the user must log in again.
      const afterReplay = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', asCookie(second));
      expect(afterReplay.status).toBe(401);
      const live = await pool.query(
        `SELECT count(*)::int AS n FROM refresh_tokens
         WHERE revoked_at IS NULL AND token_hash IN ($1, $2)`,
        [sha256(first), sha256(second)],
      );
      expect(live.rows[0].n).toBe(0);
    });

    it('only one of two simultaneous refreshes with the same token wins', async () => {
      const { refresh } = await registerUser();
      const results = await Promise.all([
        request(app).post('/api/v1/auth/refresh').set('Cookie', asCookie(refresh)),
        request(app).post('/api/v1/auth/refresh').set('Cookie', asCookie(refresh)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('rejects an expired refresh token', async () => {
      const { refresh } = await registerUser();
      await pool.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`,
        [sha256(refresh)],
      );
      const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', asCookie(refresh));
      expect(res.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token on the server and clears the cookie', async () => {
      const { refresh } = await registerUser();
      const res = await request(app).post('/api/v1/auth/logout').set('Cookie', asCookie(refresh));
      expect(res.status).toBe(204);
      expect(refreshCookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      const row = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [
        sha256(refresh),
      ]);
      expect(row.rows[0].revoked_at).not.toBeNull();
      const again = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', asCookie(refresh));
      expect(again.status).toBe(401);
    });

    it('is idempotent without a cookie', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(204);
    });
  });

  describe('forgot / reset password', () => {
    const forgot = (email) => request(app).post('/api/v1/auth/forgot').send({ email });
    const tokenFromMail = async (to) => {
      await vi.waitFor(() => expect(mailer.outbox.some((m) => m.to === to)).toBe(true), {
        timeout: 3000,
      });
      const mail = [...mailer.outbox].reverse().find((m) => m.to === to);
      return new URL(mail.link).searchParams.get('token');
    };

    it('answers identically whether or not the email exists', async () => {
      const { body } = await registerUser();
      const known = await forgot(body.email);
      const unknown = await forgot(uniqueEmail());
      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
      expect(known.headers['content-length']).toBe(unknown.headers['content-length']);
    });

    it('mails a link to the frontend and stores only the hash, valid for 20 minutes', async () => {
      const { body } = await registerUser();
      await forgot(body.email);
      const token = await tokenFromMail(body.email);
      const mail = mailer.outbox.find((m) => m.to === body.email);
      expect(mail.link.startsWith(`${CLIENT_ORIGIN}/restablecer?token=`)).toBe(true);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const raw = await pool.query('SELECT 1 FROM password_reset_tokens WHERE token_hash = $1', [
        token,
      ]);
      expect(raw.rowCount).toBe(0);
      const row = await pool.query(
        `SELECT extract(epoch FROM (expires_at - created_at)) AS ttl FROM password_reset_tokens WHERE token_hash = $1`,
        [sha256(token)],
      );
      expect(Math.round(row.rows[0].ttl)).toBe(1200);
    });

    it('sends nothing for an unknown email', async () => {
      const before = mailer.outbox.length;
      await forgot(uniqueEmail());
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mailer.outbox.length).toBe(before);
    });

    it('resets once: new password works, old does not, sessions are revoked, token is single-use', async () => {
      const { body, refresh } = await registerUser();
      await forgot(body.email);
      const token = await tokenFromMail(body.email);
      const newPassword = 'Nueva#Clave77';
      const ok = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token, password: newPassword });
      expect(ok.status).toBe(200);
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: PASSWORD });
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: newPassword });
      expect(oldLogin.status).toBe(401);
      expect(newLogin.status).toBe(200);
      const staleSession = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', asCookie(refresh));
      expect(staleSession.status).toBe(401);
      const reuse = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token, password: 'Otra#Clave88' });
      expect(reuse.status).toBe(400);
      expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects an expired token', async () => {
      const { body } = await registerUser();
      await forgot(body.email);
      const token = await tokenFromMail(body.email);
      await pool.query(
        `UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [sha256(token)],
      );
      const res = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token, password: 'Nueva#Clave77' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects unknown tokens and does not burn a valid one on a weak password', async () => {
      const unknown = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token: 'nope', password: 'Nueva#Clave77' });
      expect(unknown.status).toBe(400);
      const { body } = await registerUser();
      await forgot(body.email);
      const token = await tokenFromMail(body.email);
      const weak = await request(app).post('/api/v1/auth/reset').send({ token, password: 'weak' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.code).toBe('VALIDATION_ERROR');
      const ok = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token, password: 'Nueva#Clave77' });
      expect(ok.status).toBe(200);
    });

    it('a newer request voids the previous link', async () => {
      const { body } = await registerUser();
      await forgot(body.email);
      const first = await tokenFromMail(body.email);
      mailer.outbox.length = 0;
      await forgot(body.email);
      const second = await tokenFromMail(body.email);
      expect(second).not.toBe(first);
      const old = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token: first, password: 'Nueva#Clave77' });
      expect(old.status).toBe(400);
      const fresh = await request(app)
        .post('/api/v1/auth/reset')
        .send({ token: second, password: 'Nueva#Clave77' });
      expect(fresh.status).toBe(200);
    });
  });

  describe('rate limiting', () => {
    it('answers 429 after too many failed logins from one client', async () => {
      const limited = buildApp({ windowMs: 60_000, limit: 3 });
      const attempt = () =>
        request(limited)
          .post('/api/v1/auth/login')
          .send({ email: uniqueEmail(), password: 'Incorrecta#1' });
      const statuses = [];
      for (let i = 0; i < 5; i += 1) statuses.push((await attempt()).status);
      expect(statuses).toEqual([401, 401, 401, 429, 429]);
      const blocked = await attempt();
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    });

    it('limits register, forgot and reset too', async () => {
      const limited = buildApp({ windowMs: 60_000, limit: 2 });
      for (const [path, payload] of [
        ['/api/v1/auth/forgot', { email: 'a@example.com' }],
        ['/api/v1/auth/reset', { token: 'x', password: 'Nueva#Clave77' }],
        ['/api/v1/auth/register', { full_name: 'Ana', email: uniqueEmail(), password: 'weak' }],
      ]) {
        await request(limited).post(path).send(payload);
        await request(limited).post(path).send(payload);
        const third = await request(limited).post(path).send(payload);
        expect(third.status, path).toBe(429);
      }
    });
  });
});
