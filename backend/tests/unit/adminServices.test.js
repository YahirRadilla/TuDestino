import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createAdminUserService, assertAdminSafety } from '../../src/services/adminUserService.js';
import * as reportService from '../../src/services/adminReportService.js';
import * as eventService from '../../src/services/adminEventService.js';
import { bearerFor, createAuthedApp } from '../helpers/authApp.js';
import { createFakeDb, rows } from '../helpers/fakeDb.js';

const ACTOR = { id: 'actor-1', role: 'admin' };
const REPORT_ID = '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10';

describe('assertAdminSafety', () => {
  const admin = { id: 'a-1', role: 'admin', is_active: true };
  const check = (overrides) =>
    assertAdminSafety({
      actorId: 'a-2',
      target: admin,
      next: { role: 'admin', is_active: true },
      activeAdminIds: ['a-1', 'a-2'],
      ...overrides,
    });

  it('allows changes that keep the target an active admin', () => {
    expect(() => check({})).not.toThrow();
  });

  it('allows demoting an admin while another stays active', () => {
    expect(() => check({ next: { role: 'user', is_active: true } })).not.toThrow();
  });

  it('forbids an admin from demoting or deactivating themselves', () => {
    for (const next of [
      { role: 'authority', is_active: true },
      { role: 'admin', is_active: false },
    ]) {
      expect(() => check({ actorId: 'a-1', next })).toThrow(
        expect.objectContaining({ status: 409, code: 'SELF_PROTECTION' }),
      );
    }
  });

  it('forbids removing the last active admin', () => {
    expect(() =>
      check({ activeAdminIds: ['a-1'], next: { role: 'user', is_active: true } }),
    ).toThrow(expect.objectContaining({ status: 409, code: 'LAST_ADMIN' }));
  });

  it('does not care about non-admin accounts', () => {
    expect(() =>
      check({
        target: { id: 'u-1', role: 'user', is_active: true },
        next: { role: 'user', is_active: false },
        activeAdminIds: ['a-1'],
      }),
    ).not.toThrow();
  });
});

describe('admin user service', () => {
  const build = (script) => {
    const db = createFakeDb(script);
    const audit = { record: vi.fn() };
    const service = createAdminUserService({
      db,
      passwords: { hash: vi.fn(async () => 'hash') },
      mailer: { sendInvitation: vi.fn(async () => {}) },
      audit,
    });
    return { db, audit, service };
  };

  const targetRow = (overrides) => ({
    id: 'u-1',
    role: 'user',
    is_active: true,
    area_id: null,
    ...overrides,
  });
  const publicRow = {
    id: 'u-1',
    full_name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    area_id: null,
    area_name: null,
    is_active: false,
    last_login_at: null,
    created_at: '2026-10-01',
  };

  it('deactivating revokes every refresh token inside the same transaction', async () => {
    const { db, audit, service } = build([
      ["role = 'admin' AND is_active", rows({ id: 'actor-1' }, { id: 'a-2' })],
      ['FOR UPDATE', rows(targetRow())],
      ['WHERE u.id = $1', rows(publicRow)],
    ]);
    const result = await service.updateUser('u-1', { is_active: false }, ACTOR);
    expect(result.data.is_active).toBe(false);
    const statements = db.statements();
    expect(statements[0]).toBe('BEGIN');
    const revoke = statements.findIndex((text) =>
      text.includes('UPDATE refresh_tokens SET revoked_at'),
    );
    const commit = statements.indexOf('COMMIT');
    expect(revoke).toBeGreaterThan(0);
    expect(revoke).toBeLessThan(commit);
    expect(audit.record).toHaveBeenCalledWith(
      'user.updated',
      ACTOR,
      expect.objectContaining({ targetId: 'u-1', activeTo: false, sessionsRevoked: true }),
    );
  });

  it('does not revoke sessions when only the name changes', async () => {
    const { db, service } = build([
      ["role = 'admin' AND is_active", rows({ id: 'actor-1' })],
      ['FOR UPDATE', rows(targetRow())],
      ['WHERE u.id = $1', rows(publicRow)],
    ]);
    await service.updateUser('u-1', { full_name: 'Ana María' }, ACTOR);
    expect(db.has('UPDATE refresh_tokens')).toBe(false);
  });

  it('rolls back and reports LAST_ADMIN when the change would leave no active admin', async () => {
    const { db, service } = build([
      ["role = 'admin' AND is_active", rows({ id: 'a-1' })],
      ['FOR UPDATE', rows(targetRow({ id: 'a-1', role: 'admin' }))],
    ]);
    await expect(service.updateUser('a-1', { role: 'user' }, ACTOR)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_ADMIN',
    });
    expect(db.statements()).toContain('ROLLBACK');
    expect(db.has('UPDATE users SET')).toBe(false);
  });

  it('reports SELF_PROTECTION before touching anything', async () => {
    const { db, service } = build([
      ["role = 'admin' AND is_active", rows({ id: 'actor-1' }, { id: 'a-2' })],
      ['FOR UPDATE', rows(targetRow({ id: 'actor-1', role: 'admin' }))],
    ]);
    await expect(service.updateUser('actor-1', { is_active: false }, ACTOR)).rejects.toMatchObject({
      code: 'SELF_PROTECTION',
    });
    expect(db.has('UPDATE users SET')).toBe(false);
  });

  it('answers 404 for an unknown user', async () => {
    const { service } = build([["role = 'admin' AND is_active", rows({ id: 'actor-1' })]]);
    await expect(service.updateUser('nope', { is_active: false }, ACTOR)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('report status change', () => {
  const lockRow = (status) => [
    'FOR UPDATE',
    rows({ id: REPORT_ID, folio: 'TD-2026-000001', status }),
  ];

  it('updates the report and appends the history in one transaction, with the author', async () => {
    const db = createFakeDb([
      lockRow('pending'),
      ['FROM reports r', rows({ id: REPORT_ID, folio: 'TD-2026-000001', status: 'in_review' })],
    ]);
    await reportService.changeStatus(
      db,
      REPORT_ID,
      { status: 'in_review', note: 'Revisamos' },
      { id: 'staff-1', role: 'authority' },
    );
    const statements = db.statements();
    expect(statements[0]).toBe('BEGIN');
    expect(statements.findIndex((s) => s.startsWith('UPDATE reports SET status'))).toBe(2);
    expect(statements[3]).toContain('INSERT INTO report_status_history');
    expect(statements[4]).toBe('COMMIT');
    const insert = db.log.find((entry) => entry.text.includes('INSERT INTO report_status_history'));
    expect(insert.params).toEqual([REPORT_ID, 'pending', 'in_review', 'Revisamos', 'staff-1']);
  });

  it('rolls back without writing anything on an invalid transition', async () => {
    const db = createFakeDb([lockRow('pending')]);
    await expect(
      reportService.changeStatus(
        db,
        REPORT_ID,
        { status: 'resolved', note: 'Saltando pasos' },
        { id: 'staff-1', role: 'authority' },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    expect(db.statements()).toContain('ROLLBACK');
    expect(db.has('UPDATE reports')).toBe(false);
    expect(db.has('INSERT INTO report_status_history')).toBe(false);
  });

  it('answers 404 when the report is gone', async () => {
    const db = createFakeDb([]);
    await expect(
      reportService.changeStatus(
        db,
        REPORT_ID,
        { status: 'in_review', note: 'Revisamos' },
        { id: 's', role: 'admin' },
      ),
    ).rejects.toMatchObject({ status: 404, code: 'REPORT_NOT_FOUND' });
  });
});

describe('event moderation rules', () => {
  it('maps every action to the statuses it may start from', () => {
    expect(eventService.MODERATION.approve).toEqual({ from: ['pending'], to: 'published' });
    expect(eventService.MODERATION.reject).toEqual({ from: ['pending'], to: 'rejected' });
    expect(eventService.MODERATION.cancel).toEqual({
      from: ['pending', 'published'],
      to: 'cancelled',
    });
  });

  it('refuses to moderate an event that already left the pending state', async () => {
    const db = createFakeDb([
      ['FOR UPDATE', rows({ id: 'e-1', status: 'rejected', starts_at: 'x', ends_at: null })],
    ]);
    await expect(
      eventService.moderateEvent(db, 'e-1', { action: 'approve' }, ACTOR),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    expect(db.has('SET status')).toBe(false);
  });
});

describe('staff routes without a database', () => {
  const routes = [
    ['get', '/api/v1/admin/summary'],
    ['get', '/api/v1/admin/reports'],
    ['patch', `/api/v1/admin/reports/${REPORT_ID}/status`],
    ['post', '/api/v1/admin/destinations'],
    ['post', '/api/v1/admin/events'],
    ['patch', `/api/v1/admin/events/${REPORT_ID}/moderation`],
    ['post', '/api/v1/admin/edu-contents'],
    ['get', '/api/v1/admin/users'],
    ['get', '/api/v1/admin/areas'],
    ['post', '/api/v1/events'],
    ['get', '/api/v1/me/events/proposed'],
  ];

  it.each(routes)(
    '%s %s answers 401 without a session and never touches the database',
    async (method, path) => {
      const db = createFakeDb();
      const res = await request(createAuthedApp(db))[method](path).send({});
      expect(res.status).toBe(401);
      expect(db.log).toHaveLength(0);
    },
  );

  it('answers 403 from the token claim alone to plain users', async () => {
    const db = createFakeDb();
    const res = await request(createAuthedApp(db))
      .get('/api/v1/admin/reports')
      .set('Authorization', await bearerFor({ role: 'user' }));
    expect(res.status).toBe(403);
    expect(db.log).toHaveLength(0);
  });

  it('re-reads the account: an authority whose account is inactive gets 401', async () => {
    const db = createFakeDb([
      ['FROM users WHERE id', rows({ role: 'authority', area_id: null, is_active: false })],
    ]);
    const res = await request(createAuthedApp(db))
      .get('/api/v1/admin/reports')
      .set('Authorization', await bearerFor({ role: 'authority' }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_SESSION');
  });

  it('re-reads the account: a token claiming admin is refused when the account is no longer admin', async () => {
    const db = createFakeDb([
      ['FROM users WHERE id', rows({ role: 'authority', area_id: null, is_active: true })],
    ]);
    const res = await request(createAuthedApp(db))
      .get('/api/v1/admin/users')
      .set('Authorization', await bearerFor({ role: 'admin' }));
    expect(res.status).toBe(403);
  });
});
