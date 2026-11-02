import { describe, expect, it } from 'vitest';
import {
  normalizeCode,
  normalizeFolio,
  parseLat,
  parseLng,
  validateStep,
  validateTracking,
} from './reportValidation.js';

describe('coordinates', () => {
  it('parse numbers, accept a decimal comma and enforce the range', () => {
    expect(parseLat('24.1426')).toBe(24.1426);
    expect(parseLat(' 24,1426 ')).toBe(24.1426);
    expect(parseLat('-90')).toBe(-90);
    expect(parseLat('90.0001')).toBeNull();
    expect(parseLat('')).toBeNull();
    expect(parseLat('abc')).toBeNull();
    expect(parseLat('1e2')).toBeNull();
    expect(parseLng('-110.31')).toBe(-110.31);
    expect(parseLng('181')).toBeNull();
  });
});

describe('validateStep', () => {
  const values = { type: 'contaminacion', lat: '24.1', lng: '-110.3', description: 'x'.repeat(10) };

  it('step 1 needs a type', () => {
    expect(validateStep(1, { ...values, type: '' })).toHaveProperty('type');
    expect(validateStep(1, values)).toEqual({});
  });

  it('step 2 needs a valid position', () => {
    expect(validateStep(2, { ...values, lat: '' })).toHaveProperty('lat');
    expect(validateStep(2, { ...values, lng: '200' })).toHaveProperty('lng');
    expect(validateStep(2, values)).toEqual({});
  });

  it('step 3 bounds the description after trimming', () => {
    expect(validateStep(3, { ...values, description: '  corta  ' })).toHaveProperty('description');
    expect(validateStep(3, { ...values, description: 'x'.repeat(2001) })).toHaveProperty('description');
    expect(validateStep(3, values)).toEqual({});
  });
});

describe('tracking input', () => {
  it('normalises what people type by hand', () => {
    expect(normalizeFolio(' td-2026-000007 ')).toBe('TD-2026-000007');
    expect(normalizeCode('abcde-2345 6')).toBe('ABCDE23456');
  });

  it('validates folio shape and code length', () => {
    expect(validateTracking({ folio: 'td-2026-000007', code: 'abcde-23456' })).toEqual({});
    expect(validateTracking({ folio: 'TD-26-7', code: 'abc' })).toEqual({
      folio: expect.any(String),
      code: expect.any(String),
    });
  });
});
