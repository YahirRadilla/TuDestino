import { describe, expect, it } from 'vitest';
import {
  collectErrors,
  validateAvatarUrl,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validatePasswordConfirmation,
  validateRequiredPassword,
} from './validation.js';

describe('validateEmail', () => {
  it('accepts a normal address (trimmed) and rejects empty or malformed ones', () => {
    expect(validateEmail(' ana@correo.com ')).toBe('');
    expect(validateEmail('')).toMatch(/Ingresa tu correo/);
    expect(validateEmail('ana@')).toMatch(/correo válido/);
    expect(validateEmail('ana correo@x.com')).toMatch(/correo válido/);
  });
});

describe('validateNewPassword', () => {
  it.each([
    ['', /Crea una contraseña/],
    ['a1!', /al menos 8/],
    ['Contrasena!!', /número/],
    ['Contrasena123', /símbolo/],
    [`a1!${'x'.repeat(70)}`, /demasiado larga/],
  ])('rejects %j', (value, message) => {
    expect(validateNewPassword(value)).toMatch(message);
  });

  it('accepts 8+ characters with a number and a symbol', () => {
    expect(validateNewPassword('Segura#2026')).toBe('');
  });
});

describe('other validators', () => {
  it('login password only needs a value', () => {
    expect(validateRequiredPassword('')).toMatch(/Ingresa/);
    expect(validateRequiredPassword('x')).toBe('');
  });

  it('name length', () => {
    expect(validateFullName(' ')).toMatch(/Ingresa tu nombre/);
    expect(validateFullName('A')).toMatch(/2 caracteres/);
    expect(validateFullName('Ana')).toBe('');
  });

  it('confirmation must match', () => {
    expect(validatePasswordConfirmation('a', '')).toMatch(/Repite/);
    expect(validatePasswordConfirmation('a', 'b')).toMatch(/no coinciden/);
    expect(validatePasswordConfirmation('a', 'a')).toBe('');
  });

  it('avatar is optional but must be https', () => {
    expect(validateAvatarUrl('')).toBe('');
    expect(validateAvatarUrl('https://x.test/a.png')).toBe('');
    expect(validateAvatarUrl('http://x.test/a.png')).toMatch(/https/);
    expect(validateAvatarUrl('not a url')).toMatch(/válida/);
  });

  it('collectErrors keeps only failing fields', () => {
    expect(collectErrors({ a: '', b: 'mal' })).toEqual({ b: 'mal' });
  });
});
