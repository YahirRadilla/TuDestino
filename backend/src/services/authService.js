import { HttpError } from '../utils/httpError.js';
import { generateOpaqueToken, hashToken } from './tokenService.js';
import * as userModel from '../models/userModel.js';
import * as refreshModel from '../models/refreshTokenModel.js';
import * as resetModel from '../models/passwordResetModel.js';

export const RESET_TOKEN_TTL_SECONDS = 20 * 60;

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
const invalidSession = () =>
  new HttpError(401, 'INVALID_SESSION', 'Tu sesión expiró. Inicia sesión de nuevo.');

// Whitelist: whatever the model returns, only these fields reach the client.
export const toPublicUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  avatar_url: row.avatar_url ?? null,
  role: row.role,
  area_id: row.area_id ?? null,
  created_at: row.created_at,
});

export function createAuthService({
  db,
  passwords,
  tokens,
  mailer,
  audit,
  refreshTtlSeconds,
  resetTtlSeconds = RESET_TOKEN_TTL_SECONDS,
}) {
  async function issueSession(user, { userAgent }) {
    const refresh = generateOpaqueToken();
    await refreshModel.insertRefreshToken(db, {
      userId: user.id,
      tokenHash: refresh.hash,
      ttlSeconds: refreshTtlSeconds,
      userAgent,
    });
    return {
      user: toPublicUser(user),
      accessToken: await tokens.signAccessToken(user),
      expiresIn: tokens.ttlSeconds,
      refreshToken: refresh.token,
    };
  }

  return {
    async register({ full_name: fullName, email, password }, ctx) {
      const passwordHash = await passwords.hash(password);
      const user = await userModel.insertUser(db, { fullName, email, passwordHash });
      if (!user) throw new HttpError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
      audit.info('auth.registered', { userId: user.id, ip: ctx.ip });
      return issueSession(user, ctx);
    },

    async login({ email, password }, ctx) {
      const user = await userModel.findCredentialsByEmail(db, email);
      // Always run exactly one bcrypt comparison so unknown accounts take as long as real ones.
      const passwordOk = user
        ? await passwords.verify(password, user.password_hash)
        : await passwords.verifyDummy(password);
      if (!user || !passwordOk || !user.is_active) {
        let reason = 'inactive_account';
        if (!user) reason = 'unknown_user';
        else if (!passwordOk) reason = 'bad_password';
        audit.warn('auth.login_failed', { email, ip: ctx.ip, reason });
        throw invalidCredentials();
      }
      await userModel.touchLastLogin(db, user.id);
      audit.info('auth.login_succeeded', { userId: user.id, ip: ctx.ip });
      return issueSession(user, ctx);
    },

    // Rotation: the presented token is revoked atomically and a new one is issued. Presenting a
    // token that was already rotated/revoked means it leaked or was replayed: revoke everything.
    async refresh(rawToken, ctx) {
      if (!rawToken) throw invalidSession();
      const tokenHash = hashToken(rawToken);
      const userId = await refreshModel.consumeRefreshToken(db, tokenHash);
      if (!userId) {
        const state = await refreshModel.findRefreshTokenState(db, tokenHash);
        if (state?.revoked) {
          await refreshModel.revokeAllRefreshTokens(db, state.user_id);
          audit.warn('auth.refresh_reuse_detected', { userId: state.user_id, ip: ctx.ip });
        }
        throw invalidSession();
      }
      const user = await userModel.findPublicById(db, userId);
      if (!user) throw invalidSession();
      return issueSession(user, ctx);
    },

    // Idempotent: unknown or already revoked tokens are not an error.
    async logout(rawToken) {
      if (rawToken) await refreshModel.revokeRefreshToken(db, hashToken(rawToken));
    },

    // Never reveals whether the account exists; callers must not wait on it before answering.
    async requestPasswordReset({ email }, ctx) {
      const user = await userModel.findCredentialsByEmail(db, email);
      if (!user?.is_active) return;
      const reset = generateOpaqueToken();
      await resetModel.insertResetToken(db, {
        userId: user.id,
        tokenHash: reset.hash,
        ttlSeconds: resetTtlSeconds,
      });
      await mailer.sendPasswordReset({
        to: user.email,
        name: user.full_name,
        token: reset.token,
        ttlMinutes: Math.round(resetTtlSeconds / 60),
      });
      audit.info('auth.password_reset_requested', { userId: user.id, ip: ctx.ip });
    },

    async resetPassword({ token, password }, ctx) {
      const passwordHash = await passwords.hash(password);
      const userId = await resetModel.consumeResetToken(db, {
        tokenHash: hashToken(token),
        passwordHash,
      });
      if (!userId) {
        audit.warn('auth.password_reset_rejected', { ip: ctx.ip });
        throw new HttpError(400, 'INVALID_RESET_TOKEN', 'El enlace no es válido o ya venció.');
      }
      audit.info('auth.password_reset_completed', { userId, ip: ctx.ip });
    },

    async getProfile(userId) {
      const user = await userModel.findPublicById(db, userId);
      if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Debes iniciar sesión.');
      return toPublicUser(user);
    },

    async updateProfile(userId, changes) {
      const user = await userModel.updateProfile(db, userId, changes);
      if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Debes iniciar sesión.');
      return toPublicUser(user);
    },
  };
}
