import { describe, expect, it, vi } from 'vitest';
import { createAuthenticate, requireArea, requireRole } from '../../src/middleware/auth.js';

const run = (middleware, req = {}) =>
  new Promise((resolve) => {
    const res = { set: vi.fn() };
    req.headers ??= {};
    middleware(req, res, (error) => resolve({ error, res }));
  });

describe('authenticate', () => {
  const verifyAccessToken = vi.fn(async (token) =>
    token === 'good' ? { id: 'u1', role: 'user', areaId: null } : null,
  );
  const authenticate = createAuthenticate({ verifyAccessToken });

  it('attaches the user for a valid bearer token', async () => {
    const req = { headers: { authorization: 'Bearer good' } };
    const { error } = await run(authenticate, req);
    expect(error).toBeUndefined();
    expect(req.user).toEqual({ id: 'u1', role: 'user', areaId: null });
  });

  it.each([undefined, 'Bearer bad', 'Basic good', 'Bearer', 'good'])(
    'answers 401 for authorization=%s',
    async (authorization) => {
      const { error, res } = await run(authenticate, { headers: { authorization } });
      expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
      expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    },
  );
});

describe('requireRole', () => {
  it('passes allowed roles, 403 for others, 401 without a user', async () => {
    const guard = requireRole('authority', 'admin');
    expect((await run(guard, { user: { role: 'admin' } })).error).toBeUndefined();
    expect((await run(guard, { user: { role: 'user' } })).error).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect((await run(guard, {})).error).toMatchObject({ status: 401 });
  });
});

describe('requireArea', () => {
  const guard = requireArea((req) => req.areaOfResource);
  const denied = { status: 403 };

  it('lets admins through regardless of the area', async () => {
    const { error } = await run(guard, { user: { role: 'admin' }, areaOfResource: 9 });
    expect(error).toBeUndefined();
  });

  it('lets an authority through only inside its own area', async () => {
    const user = { role: 'authority', areaId: 3 };
    expect((await run(guard, { user, areaOfResource: 3 })).error).toBeUndefined();
    expect((await run(guard, { user, areaOfResource: 4 })).error).toMatchObject(denied);
    expect((await run(guard, { user, areaOfResource: null })).error).toMatchObject(denied);
  });

  it('denies authorities without area, plain users and anonymous callers', async () => {
    const noArea = { role: 'authority', areaId: null };
    expect((await run(guard, { user: noArea, areaOfResource: 1 })).error).toMatchObject(denied);
    const plain = { role: 'user', areaId: 1 };
    expect((await run(guard, { user: plain, areaOfResource: 1 })).error).toMatchObject(denied);
    expect((await run(guard, {})).error).toMatchObject({ status: 401 });
  });
});
