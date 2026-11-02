import { describe, expect, it } from 'vitest';
import {
  changeReportStatusBody,
  createAdminUserBody,
  createDestinationBody,
  createEduBody,
  createEventBody,
  evidenceParams,
  listAdminReportsQuery,
  moderateEventBody,
  updateAdminUserBody,
  updateDestinationBody,
  updateEventBody,
} from '../../src/validators/admin.js';

const future = (days = 5) => new Date(Date.now() + days * 86_400_000).toISOString();
const ok = (schema, value) => schema.safeParse(value);

describe('report status body', () => {
  it('accepts a valid status with a trimmed note', () => {
    const result = ok(changeReportStatusBody, { status: 'in_review', note: '  Revisando  ' });
    expect(result.success).toBe(true);
    expect(result.data.note).toBe('Revisando');
  });

  it.each([
    ['missing note', { status: 'in_review' }],
    ['blank note', { status: 'in_review', note: '   ' }],
    ['short note', { status: 'in_review', note: 'ab' }],
    ['long note', { status: 'in_review', note: 'x'.repeat(1001) }],
    ['unknown status', { status: 'closed', note: 'nota válida' }],
    ['extra field', { status: 'in_review', note: 'nota válida', description: 'x' }],
  ])('rejects %s', (_name, body) => {
    expect(ok(changeReportStatusBody, body).success).toBe(false);
  });

  it('accepts the 1000 character limit', () => {
    expect(ok(changeReportStatusBody, { status: 'resolved', note: 'x'.repeat(1000) }).success).toBe(
      true,
    );
  });
});

describe('report list query', () => {
  it('upper-cases the folio and drops empty filters', () => {
    const result = ok(listAdminReportsQuery, { folio: 'td-2026-0001', status: 'pending' });
    expect(result.data).toMatchObject({ folio: 'TD-2026-0001', status: 'pending', page: 1 });
    expect(ok(listAdminReportsQuery, { folio: '' }).data.folio).toBeUndefined();
  });

  it('refuses characters that would act as LIKE wildcards and oversized pages', () => {
    expect(ok(listAdminReportsQuery, { folio: 'TD%' }).success).toBe(false);
    expect(ok(listAdminReportsQuery, { folio: 'TD_1' }).success).toBe(false);
    expect(ok(listAdminReportsQuery, { limit: '51' }).success).toBe(false);
  });
});

describe('evidence params', () => {
  it('needs a uuid and a numeric evidence id', () => {
    const id = '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10';
    expect(ok(evidenceParams, { id, evidenceId: '12' }).success).toBe(true);
    expect(ok(evidenceParams, { id, evidenceId: '1; DROP' }).success).toBe(false);
    expect(ok(evidenceParams, { id: 'x', evidenceId: '1' }).success).toBe(false);
  });
});

describe('destination bodies', () => {
  const base = { name: 'Playa Nueva', category: 'playa', lat: 24.1, lng: -110.3 };

  it('needs name, category and coordinates; everything else is optional', () => {
    expect(ok(createDestinationBody, base).success).toBe(true);
    expect(ok(createDestinationBody, { ...base, name: undefined }).success).toBe(false);
    expect(ok(createDestinationBody, { ...base, lat: 91 }).success).toBe(false);
  });

  it('accepts https and /img/ images only', () => {
    const images = (url) => ({ ...base, images: [{ url }] });
    expect(ok(createDestinationBody, images('https://cdn.example.com/a.jpg')).success).toBe(true);
    expect(ok(createDestinationBody, images('/img/a.svg')).success).toBe(true);
    expect(ok(createDestinationBody, images('http://cdn.example.com/a.jpg')).success).toBe(false);
    expect(ok(createDestinationBody, images('javascript:alert(1)')).success).toBe(false);
    expect(ok(createDestinationBody, images('//evil.example.com/a.jpg')).success).toBe(false);
  });

  it('clears optional text with an empty string and rejects unknown fields', () => {
    const result = ok(createDestinationBody, { ...base, regulations: '  ' });
    expect(result.data.regulations).toBeNull();
    expect(ok(createDestinationBody, { ...base, created_by: 'x' }).success).toBe(false);
    expect(ok(createDestinationBody, { ...base, status: 'pending' }).success).toBe(false);
  });

  it('patches need one field and coordinates together', () => {
    expect(ok(updateDestinationBody, {}).success).toBe(false);
    expect(ok(updateDestinationBody, { lat: 24 }).success).toBe(false);
    expect(ok(updateDestinationBody, { lat: 24, lng: -110 }).success).toBe(true);
    expect(ok(updateDestinationBody, { status: 'published' }).success).toBe(true);
  });
});

describe('event bodies', () => {
  const base = { title: 'Limpieza de playa', starts_at: future() };

  it('refuses past dates on creation (HU-A06) but tolerates a few minutes of clock skew', () => {
    expect(ok(createEventBody, base).success).toBe(true);
    expect(ok(createEventBody, { ...base, starts_at: future(-1) }).success).toBe(false);
    const justNow = new Date(Date.now() - 60_000).toISOString();
    expect(ok(createEventBody, { ...base, starts_at: justNow }).success).toBe(true);
  });

  it('requires the end not to precede the start', () => {
    expect(ok(createEventBody, { ...base, ends_at: future(4) }).success).toBe(false);
    expect(ok(createEventBody, { ...base, ends_at: future(6) }).success).toBe(true);
    expect(ok(createEventBody, { ...base, ends_at: null }).success).toBe(true);
  });

  it('requires coordinates together and rejects forged fields', () => {
    expect(ok(createEventBody, { ...base, lat: 24 }).success).toBe(false);
    expect(ok(createEventBody, { ...base, lat: 24, lng: -110 }).success).toBe(true);
    expect(ok(createEventBody, { ...base, status: 'published' }).success).toBe(false);
    expect(ok(createEventBody, { ...base, organizer_id: 'x' }).success).toBe(false);
  });

  it('lets an edit keep a past date', () => {
    expect(ok(updateEventBody, { starts_at: future(-3) }).success).toBe(true);
    expect(ok(updateEventBody, {}).success).toBe(false);
    expect(ok(updateEventBody, { starts_at: future(5), ends_at: future(2) }).success).toBe(false);
  });

  it('needs a reason to reject but not to approve', () => {
    expect(ok(moderateEventBody, { action: 'approve' }).success).toBe(true);
    expect(ok(moderateEventBody, { action: 'reject' }).success).toBe(false);
    expect(ok(moderateEventBody, { action: 'reject', reason: 'ab' }).success).toBe(false);
    expect(ok(moderateEventBody, { action: 'reject', reason: 'Duplicado' }).success).toBe(true);
    expect(ok(moderateEventBody, { action: 'publish' }).success).toBe(false);
  });
});

describe('education body', () => {
  it('accepts an article with defaults and rejects unknown types', () => {
    const base = { title: 'Guía de avistamiento', type: 'article', category: 'fauna-marina' };
    expect(ok(createEduBody, base).success).toBe(true);
    expect(ok(createEduBody, { ...base, type: 'podcast' }).success).toBe(false);
    expect(ok(createEduBody, { ...base, media_url: 'ftp://x.example.com' }).success).toBe(false);
  });
});

describe('user bodies', () => {
  it('only creates authorities and admins, with a normalised email', () => {
    const body = { full_name: 'Ana Pérez', email: ' ANA@Example.com ', role: 'authority' };
    expect(ok(createAdminUserBody, body).data.email).toBe('ana@example.com');
    expect(ok(createAdminUserBody, { ...body, role: 'user' }).success).toBe(false);
    expect(ok(createAdminUserBody, { ...body, password: 'x' }).success).toBe(false);
  });

  it('patches roles, area and state, never credentials', () => {
    expect(ok(updateAdminUserBody, { role: 'user' }).success).toBe(true);
    expect(ok(updateAdminUserBody, { area_id: null, is_active: false }).success).toBe(true);
    expect(ok(updateAdminUserBody, {}).success).toBe(false);
    expect(ok(updateAdminUserBody, { password_hash: 'x' }).success).toBe(false);
    expect(ok(updateAdminUserBody, { role: 'superuser' }).success).toBe(false);
  });
});
