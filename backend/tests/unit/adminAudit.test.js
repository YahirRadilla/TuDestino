import { describe, expect, it, vi } from 'vitest';
import { createAdminAudit } from '../../src/services/adminAudit.js';

describe('admin audit', () => {
  it('logs the action, the actor and primitive identifiers', () => {
    const logger = { info: vi.fn() };
    createAdminAudit(logger).record(
      'report.status_changed',
      { id: 'u-1', role: 'authority' },
      { reportId: 'r-1', from: 'pending', to: 'in_review', sessionsRevoked: true, count: 2 },
    );
    expect(logger.info).toHaveBeenCalledWith(
      {
        audit: 'admin.report.status_changed',
        actorId: 'u-1',
        actorRole: 'authority',
        reportId: 'r-1',
        from: 'pending',
        to: 'in_review',
        sessionsRevoked: true,
        count: 2,
      },
      'admin action',
    );
  });

  it('drops free text, objects and empty values so no personal data can be logged', () => {
    const logger = { info: vi.fn() };
    createAdminAudit(logger).record(
      'x',
      { id: 'u-1', role: 'admin' },
      {
        note: 'Una nota <script> con datos personales de alguien',
        email: 'ana@example.com',
        nested: { a: 1 },
        list: ['a'],
        empty: null,
        missing: undefined,
        ok: 'safe-value',
      },
    );
    const [fields] = logger.info.mock.calls[0];
    expect(fields).toEqual({
      audit: 'admin.x',
      actorId: 'u-1',
      actorRole: 'admin',
      ok: 'safe-value',
    });
  });

  it('works without a logger', () => {
    expect(() => createAdminAudit(undefined).record('x', { id: 'u' }, {})).not.toThrow();
  });
});
