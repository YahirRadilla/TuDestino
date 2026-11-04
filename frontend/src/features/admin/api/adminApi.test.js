import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noContent, stubApi } from '../../../test/apiStub.js';
import { catalogRevision } from '../../../storage/catalogFreshness.js';
import { createDestination, deleteDestination, moderateEvent } from './adminApi.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('public catalogue invalidation', () => {
  it('changes the revision after creating a destination', async () => {
    stubApi({ 'POST /admin/destinations': { data: { id: 'd-1', name: 'Nuevo' } } });
    expect(catalogRevision()).toBeFalsy();
    await createDestination({ name: 'Nuevo' });
    expect(catalogRevision()).toBeTruthy();
  });

  it('changes the revision after deleting a destination', async () => {
    stubApi({ 'DELETE /admin/destinations/d-1': noContent() });
    await deleteDestination('d-1');
    expect(catalogRevision()).toBeTruthy();
  });

  it('changes the revision after approving an event', async () => {
    stubApi({ 'PATCH /admin/events/e-1/moderation': { data: { id: 'e-1', status: 'published' } } });
    await moderateEvent('e-1', { action: 'approve' });
    expect(catalogRevision()).toBeTruthy();
  });
});
