import { describe, expect, it } from 'vitest';
import { emptyEventForm, eventPayload, eventToForm, toLocalInput, validateEventForm } from './eventForm.js';

const NOW = new Date('2026-10-18T12:00:00').getTime();
const valid = (overrides = {}) => ({
  ...emptyEventForm(),
  title: 'Limpieza de playa',
  starts_at: '2026-10-25T09:00',
  ...overrides,
});

describe('event form validation', () => {
  it('accepts the minimum data', () => {
    expect(validateEventForm(valid(), { now: NOW })).toEqual({});
  });

  it('forbids a start in the past when creating (HU-A06) but tolerates a few minutes', () => {
    expect(validateEventForm(valid({ starts_at: '2026-10-17T09:00' }), { now: NOW })).toHaveProperty(
      'starts_at',
    );
    expect(validateEventForm(valid({ starts_at: '2026-10-18T11:58' }), { now: NOW })).toEqual({});
  });

  it('lets an edit keep a date that already passed', () => {
    expect(validateEventForm(valid({ starts_at: '2026-09-01T09:00' }), { isNew: false, now: NOW })).toEqual(
      {},
    );
  });

  it('requires the title and the start', () => {
    const errors = validateEventForm({ ...emptyEventForm(), title: 'ab' }, { now: NOW });
    expect(Object.keys(errors).sort()).toEqual(['starts_at', 'title']);
  });

  it('keeps the end after the start', () => {
    expect(validateEventForm(valid({ ends_at: '2026-10-25T08:00' }), { now: NOW })).toHaveProperty('ends_at');
    expect(validateEventForm(valid({ ends_at: '2026-10-25T11:00' }), { now: NOW })).toEqual({});
  });

  it('asks for both coordinates or none', () => {
    expect(validateEventForm(valid({ lat: '24.1' }), { now: NOW })).toHaveProperty('lng');
    expect(validateEventForm(valid({ lat: '24.1', lng: '-110.3' }), { now: NOW })).toEqual({});
    expect(validateEventForm(valid({ lat: '95', lng: '-110.3' }), { now: NOW })).toHaveProperty('lat');
  });

  it('checks the image URL and the capacity', () => {
    expect(
      validateEventForm(valid({ image_url: 'http://x.example.com/a.jpg' }), { now: NOW }),
    ).toHaveProperty('image_url');
    expect(validateEventForm(valid({ capacity: '0' }), { now: NOW })).toHaveProperty('capacity');
    expect(validateEventForm(valid({ capacity: '12.5' }), { now: NOW })).toHaveProperty('capacity');
    expect(
      validateEventForm(valid({ capacity: '40', image_url: 'https://x.example.com/a.jpg' }), { now: NOW }),
    ).toEqual({});
  });
});

describe('event payload', () => {
  it('sends ISO dates, numbers and nulls for empty optionals', () => {
    const payload = eventPayload(
      valid({ ends_at: '2026-10-25T11:00', lat: '24,1', lng: '-110.3', capacity: '40' }),
    );
    expect(payload).toEqual({
      title: 'Limpieza de playa',
      description: '',
      starts_at: new Date('2026-10-25T09:00').toISOString(),
      ends_at: new Date('2026-10-25T11:00').toISOString(),
      location_name: null,
      lat: 24.1,
      lng: -110.3,
      image_url: null,
      capacity: 40,
    });
  });

  it('clears the point when the coordinates are empty', () => {
    expect(eventPayload(valid())).toMatchObject({ lat: null, lng: null, ends_at: null, capacity: null });
  });
});

describe('event to form', () => {
  it('formats dates for datetime-local inputs in local time', () => {
    const local = new Date(2026, 9, 25, 9, 5);
    expect(toLocalInput(local.toISOString())).toBe('2026-10-25T09:05');
    expect(toLocalInput('basura')).toBe('');
  });

  it('round-trips an API event', () => {
    const form = eventToForm({
      title: 'Jornada',
      description: null,
      starts_at: new Date(2026, 9, 25, 9, 0).toISOString(),
      ends_at: null,
      location_name: 'Playa',
      location: { lat: 24.1, lng: -110.3 },
      image_url: null,
      capacity: 30,
    });
    expect(form).toMatchObject({
      title: 'Jornada',
      description: '',
      starts_at: '2026-10-25T09:00',
      ends_at: '',
      lat: '24.1',
      capacity: '30',
    });
    expect(validateEventForm(form, { isNew: false, now: NOW })).toEqual({});
  });
});
