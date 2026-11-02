import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/models/userModel.js');
vi.mock('../../src/models/refreshTokenModel.js');
vi.mock('../../src/models/passwordResetModel.js');

const userModel = await import('../../src/models/userModel.js');
const refreshModel = await import('../../src/models/refreshTokenModel.js');
const resetModel = await import('../../src/models/passwordResetModel.js');
const { createAuthService, toPublicUser } = await import('../../src/services/authService.js');
const { createAudit } = await import('../../src/services/audit.js');
const { createPasswordService } = await import('../../src/services/passwordService.js');
const { createTokenService, hashToken } = await import('../../src/services/tokenService.js');

const db = { query: vi.fn() };
const ctx = { ip: '203.0.113.9', userAgent: 'vitest' };
const passwords = createPasswordService({ rounds: 4 });
const tokens = createTokenService({ secret: 'unit-test-secret-with-enough-length-0123456789' });
const audit = { warn: vi.fn(), info: vi.fn() };
const mailer = { sendPasswordReset: vi.fn().mockResolvedValue(undefined) };
const service = createAuthService({
  db,
  passwords,
  tokens,
  mailer,
  audit,
  refreshTtlSeconds: 3600,
});

const baseUser = {
  id: 'u1',
  full_name: 'Ana',
  email: 'ana@example.com',
  avatar_url: null,
  role: 'user',
  area_id: null,
  created_at: new Date(),
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toPublicUser', () => {
  it('drops password_hash, is_active and any unknown column', () => {
    const result = toPublicUser({ ...baseUser, password_hash: 'x', secret_note: 'y' });
    expect(Object.keys(result).sort()).toEqual(
      ['area_id', 'avatar_url', 'created_at', 'email', 'full_name', 'id', 'role'].sort(),
    );
  });
});

describe('login', () => {
  it('gives the same generic error for unknown email and wrong password', async () => {
    const hash = await passwords.hash('Correcta#123');
    userModel.findCredentialsByEmail.mockResolvedValueOnce(null);
    const unknown = await service
      .login({ email: 'no@x.co', password: 'Whatever#1' }, ctx)
      .catch((e) => e);
    userModel.findCredentialsByEmail.mockResolvedValueOnce({ ...baseUser, password_hash: hash });
    const wrong = await service
      .login({ email: 'ana@example.com', password: 'Mala#1234' }, ctx)
      .catch((e) => e);
    expect(unknown).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(wrong.status).toBe(unknown.status);
    expect(wrong.code).toBe(unknown.code);
    expect(wrong.message).toBe(unknown.message);
    expect(audit.warn).toHaveBeenCalledTimes(2);
  });

  it('spends a bcrypt comparison even when the account does not exist', async () => {
    const dummy = vi.spyOn(passwords, 'verifyDummy');
    userModel.findCredentialsByEmail.mockResolvedValueOnce(null);
    await service.login({ email: 'no@x.co', password: 'Whatever#1' }, ctx).catch(() => {});
    expect(dummy).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive accounts with the same generic error', async () => {
    const hash = await passwords.hash('Correcta#123');
    userModel.findCredentialsByEmail.mockResolvedValueOnce({
      ...baseUser,
      is_active: false,
      password_hash: hash,
    });
    await expect(
      service.login({ email: 'ana@example.com', password: 'Correcta#123' }, ctx),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('issues tokens and never returns the hash on success', async () => {
    const hash = await passwords.hash('Correcta#123');
    userModel.findCredentialsByEmail.mockResolvedValueOnce({ ...baseUser, password_hash: hash });
    const session = await service.login(
      { email: 'ana@example.com', password: 'Correcta#123' },
      ctx,
    );
    expect(JSON.stringify(session)).not.toContain(hash);
    expect(await tokens.verifyAccessToken(session.accessToken)).toMatchObject({ id: 'u1' });
    const stored = refreshModel.insertRefreshToken.mock.calls[0][1];
    expect(stored.tokenHash).toBe(hashToken(session.refreshToken));
    expect(stored.tokenHash).not.toBe(session.refreshToken);
  });

  it('audits failures without password, token or full email', async () => {
    userModel.findCredentialsByEmail.mockResolvedValueOnce(null);
    await service.login({ email: 'ana@example.com', password: 'Secreta#123' }, ctx).catch(() => {});
    expect(audit.warn).toHaveBeenCalledWith(
      'auth.login_failed',
      expect.objectContaining({ reason: 'unknown_user' }),
    );
    const logged = JSON.stringify(audit.warn.mock.calls);
    expect(logged).not.toContain('Secreta#123');
  });

  it('the real audit logger masks the email and omits secrets', () => {
    const lines = [];
    const logger = { warn: (o) => lines.push(o), info: (o) => lines.push(o) };
    createAudit(logger, 'k').warn('auth.login_failed', {
      email: 'ana@example.com',
      ip: '203.0.113.9',
      reason: 'bad_password',
    });
    const text = JSON.stringify(lines);
    expect(text).not.toContain('ana@example.com');
    expect(lines[0].emailRef).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('register', () => {
  it('answers 409 when the email already exists', async () => {
    userModel.insertUser.mockResolvedValueOnce(null);
    await expect(
      service.register(
        { full_name: 'Ana', email: 'ana@example.com', password: 'Segura#2026' },
        ctx,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });

  it('stores a bcrypt hash, not the password', async () => {
    userModel.insertUser.mockResolvedValueOnce(baseUser);
    await service.register(
      { full_name: 'Ana', email: 'ana@example.com', password: 'Segura#2026' },
      ctx,
    );
    const { passwordHash } = userModel.insertUser.mock.calls[0][1];
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(passwordHash).not.toContain('Segura#2026');
  });
});

describe('refresh', () => {
  it('rotates: consumes the old token and stores a new hashed one', async () => {
    refreshModel.consumeRefreshToken.mockResolvedValueOnce('u1');
    userModel.findPublicById.mockResolvedValueOnce(baseUser);
    const session = await service.refresh('old-token', ctx);
    expect(refreshModel.consumeRefreshToken).toHaveBeenCalledWith(db, hashToken('old-token'));
    expect(session.refreshToken).not.toBe('old-token');
    expect(refreshModel.insertRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('revokes every session of the user when a revoked token is replayed', async () => {
    refreshModel.consumeRefreshToken.mockResolvedValueOnce(null);
    refreshModel.findRefreshTokenState.mockResolvedValueOnce({ user_id: 'u1', revoked: true });
    await expect(service.refresh('replayed', ctx)).rejects.toMatchObject({ status: 401 });
    expect(refreshModel.revokeAllRefreshTokens).toHaveBeenCalledWith(db, 'u1');
    expect(audit.warn).toHaveBeenCalledWith(
      'auth.refresh_reuse_detected',
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('does not revoke anything for unknown or merely expired tokens', async () => {
    refreshModel.consumeRefreshToken.mockResolvedValue(null);
    refreshModel.findRefreshTokenState.mockResolvedValueOnce(null);
    await expect(service.refresh('unknown', ctx)).rejects.toMatchObject({ status: 401 });
    refreshModel.findRefreshTokenState.mockResolvedValueOnce({ user_id: 'u1', revoked: false });
    await expect(service.refresh('expired', ctx)).rejects.toMatchObject({ status: 401 });
    await expect(service.refresh(undefined, ctx)).rejects.toMatchObject({ status: 401 });
    expect(refreshModel.revokeAllRefreshTokens).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('does nothing observable for an unknown email', async () => {
    userModel.findCredentialsByEmail.mockResolvedValueOnce(null);
    await expect(service.requestPasswordReset({ email: 'no@x.co' }, ctx)).resolves.toBeUndefined();
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
    expect(resetModel.insertResetToken).not.toHaveBeenCalled();
  });

  it('stores only the SHA-256 of a 20-minute token and mails the raw one', async () => {
    userModel.findCredentialsByEmail.mockResolvedValueOnce({ ...baseUser, password_hash: 'h' });
    await service.requestPasswordReset({ email: 'ana@example.com' }, ctx);
    const stored = resetModel.insertResetToken.mock.calls[0][1];
    const mailed = mailer.sendPasswordReset.mock.calls[0][0];
    expect(stored.ttlSeconds).toBe(1200);
    expect(stored.tokenHash).toBe(hashToken(mailed.token));
    expect(stored.tokenHash).not.toBe(mailed.token);
    expect(mailed.ttlMinutes).toBe(20);
  });

  it('rejects an invalid, used or expired token with 400', async () => {
    resetModel.consumeResetToken.mockResolvedValueOnce(null);
    await expect(
      service.resetPassword({ token: 'nope', password: 'Nueva#12345' }, ctx),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_RESET_TOKEN' });
  });

  it('hashes the new password and consumes the token by hash', async () => {
    resetModel.consumeResetToken.mockResolvedValueOnce('u1');
    await service.resetPassword({ token: 'raw', password: 'Nueva#12345' }, ctx);
    const args = resetModel.consumeResetToken.mock.calls[0][1];
    expect(args.tokenHash).toBe(hashToken('raw'));
    expect(args.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('logout', () => {
  it('revokes the presented token and tolerates a missing one', async () => {
    await service.logout('raw');
    expect(refreshModel.revokeRefreshToken).toHaveBeenCalledWith(db, hashToken('raw'));
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    expect(refreshModel.revokeRefreshToken).toHaveBeenCalledTimes(1);
  });
});
