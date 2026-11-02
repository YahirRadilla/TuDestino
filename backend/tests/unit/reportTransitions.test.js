import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition } from '../../src/services/reportTransitions.js';

describe('report status machine', () => {
  it.each([
    ['pending', 'in_review'],
    ['pending', 'dismissed'],
    ['in_review', 'resolved'],
    ['in_review', 'dismissed'],
    ['in_review', 'pending'],
  ])('allows %s -> %s to an authority', (from, to) => {
    expect(canTransition(from, to, 'authority')).toBe(true);
    expect(canTransition(from, to, 'admin')).toBe(true);
  });

  it.each([
    ['pending', 'resolved'],
    ['pending', 'pending'],
    ['in_review', 'in_review'],
    ['resolved', 'pending'],
    ['resolved', 'dismissed'],
    ['dismissed', 'resolved'],
    ['dismissed', 'pending'],
    ['pending', 'bogus'],
    ['bogus', 'pending'],
  ])('never allows %s -> %s', (from, to) => {
    expect(canTransition(from, to, 'authority')).toBe(false);
    expect(canTransition(from, to, 'admin')).toBe(false);
  });

  it('keeps closed reports closed for authorities but lets an admin reopen them to in_review', () => {
    for (const from of ['resolved', 'dismissed']) {
      expect(allowedTransitions(from, 'authority')).toEqual([]);
      expect(allowedTransitions(from, 'admin')).toEqual(['in_review']);
    }
  });

  it('never allows anyone but staff roles to reopen', () => {
    expect(canTransition('resolved', 'in_review', 'user')).toBe(false);
    expect(canTransition('resolved', 'in_review', undefined)).toBe(false);
  });

  it('lists the valid targets of each open status', () => {
    expect(allowedTransitions('pending', 'authority')).toEqual(['in_review', 'dismissed']);
    expect(allowedTransitions('in_review', 'authority')).toEqual([
      'resolved',
      'dismissed',
      'pending',
    ]);
    expect(allowedTransitions('unknown', 'admin')).toEqual([]);
  });
});
