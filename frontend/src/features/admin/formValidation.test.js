import { describe, expect, it } from 'vitest';
import {
  destinationPayload,
  destinationToForm,
  emptyDestination,
  emptyEdu,
  eduPayload,
  isImageUrl,
  newUserPayload,
  validateDestination,
  validateEdu,
  validateNewUser,
} from './formValidation.js';
import { destinationItem } from '../../test/adminFixtures.js';

const validDestination = () => ({
  ...emptyDestination(),
  name: 'Playa Nueva',
  category: 'playa',
  lat: '24,1426',
  lng: '-110.3128',
});

describe('image URLs', () => {
  it.each([
    ['https://cdn.example.com/a.jpg', true],
    ['/img/playa-1.svg', true],
    ['http://cdn.example.com/a.jpg', false],
    ['//evil.example.com/a.jpg', false],
    ['javascript:alert(1)', false],
    ['/otra/ruta.png', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isImageUrl(value)).toBe(expected);
  });
});

describe('destination form', () => {
  it('accepts the minimum data and a Spanish decimal comma', () => {
    expect(validateDestination(validDestination())).toEqual({});
    expect(destinationPayload(validDestination())).toMatchObject({ lat: 24.1426, lng: -110.3128 });
  });

  it('reports every missing or wrong field', () => {
    const errors = validateDestination({
      ...emptyDestination(),
      name: 'x',
      slug: 'No Valido',
      lat: '95',
      lng: 'abc',
    });
    expect(Object.keys(errors).sort()).toEqual(['category', 'lat', 'lng', 'name', 'slug']);
  });

  it('checks the images and the care tips', () => {
    const bad = validateDestination({
      ...validDestination(),
      images: [
        { url: 'https://a.example.com/x.jpg', alt_text: '' },
        { url: 'http://insecure', alt_text: '' },
      ],
      care_tips: Array.from({ length: 11 }, (_, i) => `consejo ${i}`).join('\n'),
    });
    expect(bad.images).toMatch(/imagen 2/);
    expect(bad.care_tips).toMatch(/Máximo 10/);
  });

  it('builds the payload: trims, nulls empty optionals, splits tips, keeps image order', () => {
    const payload = destinationPayload({
      ...validDestination(),
      name: '  Playa Nueva ',
      municipality: ' ',
      regulations: '',
      care_tips: 'Llévate tu basura\n\n  No toques la fauna  ',
      is_protected_area: true,
      status: 'published',
      images: [
        { url: ' /img/a.svg ', alt_text: ' Vista ' },
        { url: 'https://cdn.example.com/b.jpg', alt_text: '' },
      ],
    });
    expect(payload).toEqual({
      name: 'Playa Nueva',
      summary: '',
      description: '',
      category: 'playa',
      lat: 24.1426,
      lng: -110.3128,
      municipality: null,
      regulations: null,
      care_tips: ['Llévate tu basura', 'No toques la fauna'],
      is_protected_area: true,
      status: 'published',
      images: [
        { url: '/img/a.svg', alt_text: 'Vista' },
        { url: 'https://cdn.example.com/b.jpg', alt_text: null },
      ],
    });
  });

  it('round-trips a destination through the form', () => {
    const form = destinationToForm(destinationItem());
    expect(form).toMatchObject({
      name: 'Playa Balandra',
      category: 'playa',
      lat: '24.3',
      care_tips: 'No toques la fauna',
      images: [{ url: '/img/a.svg', alt_text: 'Vista' }],
    });
    expect(validateDestination(form)).toEqual({});
  });
});

describe('education form', () => {
  const base = { ...emptyEdu(), title: 'Guía de avistamiento', category: 'fauna-marina' };

  it('accepts an article without URL', () => {
    expect(validateEdu(base)).toEqual({});
  });

  it('requires an https URL for videos and links', () => {
    expect(validateEdu({ ...base, type: 'video' })).toHaveProperty('media_url');
    expect(validateEdu({ ...base, type: 'link', media_url: 'http://x.example.com' })).toHaveProperty(
      'media_url',
    );
    expect(validateEdu({ ...base, type: 'video', media_url: 'https://youtu.be/x' })).toEqual({});
  });

  it('validates the title, the category and the cover', () => {
    const errors = validateEdu({ ...emptyEdu(), title: 'ab', cover_url: 'ftp://x' });
    expect(Object.keys(errors).sort()).toEqual(['category', 'cover_url', 'title']);
  });

  it('builds a payload with nulls for empty optionals', () => {
    expect(eduPayload({ ...base, is_published: true, body: ' Texto ' })).toEqual({
      title: 'Guía de avistamiento',
      type: 'article',
      body: 'Texto',
      media_url: null,
      cover_url: null,
      category: 'fauna-marina',
      is_published: true,
    });
  });
});

describe('new user form', () => {
  it('needs a name, a valid email and a staff role', () => {
    expect(
      validateNewUser({ full_name: 'Ana', email: 'ana@example.com', role: 'authority', area_id: '' }),
    ).toEqual({});
    const errors = validateNewUser({ full_name: 'A', email: 'sin-arroba', role: 'user', area_id: '' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'full_name', 'role']);
  });

  it('normalises the payload', () => {
    expect(
      newUserPayload({ full_name: ' Ana ', email: ' ANA@Example.com ', role: 'admin', area_id: '3' }),
    ).toEqual({ full_name: 'Ana', email: 'ana@example.com', role: 'admin', area_id: 3 });
    expect(
      newUserPayload({ full_name: 'Ana', email: 'a@b.co', role: 'admin', area_id: '' }).area_id,
    ).toBeNull();
  });
});
