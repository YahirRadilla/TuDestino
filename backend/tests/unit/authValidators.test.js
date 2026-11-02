import { describe, expect, it } from 'vitest';
import {
  forgotBody,
  loginBody,
  registerBody,
  resetBody,
  updateProfileBody,
} from '../../src/validators/auth.js';

const valid = { full_name: 'Ana Pérez', email: 'Ana@Example.com ', password: 'Segura#2026' };

describe('registerBody', () => {
  it('normalizes email and name', () => {
    const result = registerBody.parse({ ...valid, full_name: '  Ana Pérez ' });
    expect(result).toEqual({
      full_name: 'Ana Pérez',
      email: 'ana@example.com',
      password: 'Segura#2026',
    });
  });

  it.each([
    ['too short', 'a1!'],
    ['without number', 'Contraseña!!'],
    ['without symbol', 'Contrasena123'],
    ['over 72 bytes (bcrypt limit)', `a1!${'x'.repeat(70)}`],
  ])('rejects a password %s', (_label, password) => {
    expect(registerBody.safeParse({ ...valid, password }).success).toBe(false);
  });

  it('rejects an invalid email or a short name', () => {
    expect(registerBody.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(registerBody.safeParse({ ...valid, full_name: 'A' }).success).toBe(false);
  });

  it('rejects unknown fields such as role', () => {
    expect(registerBody.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
  });
});

describe('loginBody / forgotBody / resetBody', () => {
  it('login does not apply password strength rules', () => {
    expect(loginBody.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginBody.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('forgot only needs an email', () => {
    expect(forgotBody.parse({ email: 'A@B.co' })).toEqual({ email: 'a@b.co' });
  });

  it('reset requires a token and a strong password', () => {
    expect(resetBody.safeParse({ token: 'abc', password: 'Segura#2026' }).success).toBe(true);
    expect(resetBody.safeParse({ token: '', password: 'Segura#2026' }).success).toBe(false);
    expect(resetBody.safeParse({ token: 'abc', password: 'weak' }).success).toBe(false);
  });
});

describe('updateProfileBody', () => {
  it('accepts name and https avatar, or null to clear it', () => {
    expect(
      updateProfileBody.parse({ full_name: 'Ana', avatar_url: 'https://x.test/a.png' }),
    ).toEqual({
      full_name: 'Ana',
      avatar_url: 'https://x.test/a.png',
    });
    expect(updateProfileBody.parse({ avatar_url: null })).toEqual({ avatar_url: null });
  });

  it('rejects empty bodies, role/email changes and non-https avatars', () => {
    expect(updateProfileBody.safeParse({}).success).toBe(false);
    expect(updateProfileBody.safeParse({ role: 'admin' }).success).toBe(false);
    expect(updateProfileBody.safeParse({ full_name: 'Ana', email: 'x@y.co' }).success).toBe(false);
    expect(updateProfileBody.safeParse({ avatar_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(updateProfileBody.safeParse({ avatar_url: 'http://x.test/a.png' }).success).toBe(false);
  });
});
