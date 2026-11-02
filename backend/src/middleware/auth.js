import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const unauthorized = () =>
  new HttpError(401, 'UNAUTHORIZED', 'Debes iniciar sesión para continuar.');
const forbidden = () =>
  new HttpError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.');

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

// Verifies the access token (stateless) and exposes `req.user = { id, role, areaId }`.
export function createAuthenticate(tokens) {
  return asyncHandler(async (req, res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? '');
    const user = match ? await tokens.verifyAccessToken(match[1]) : null;
    if (!user) {
      res.set('WWW-Authenticate', 'Bearer');
      throw unauthorized();
    }
    req.user = user;
    next();
  });
}

// For public resources that personalise their answer when a session exists. A missing, forged or
// expired token simply means "anonymous": the endpoint stays usable without logging in.
export function createOptionalAuthenticate(tokens) {
  return asyncHandler(async (req, _res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? '');
    const user = match ? await tokens.verifyAccessToken(match[1]) : null;
    if (user) req.user = user;
    next();
  });
}

// Must run after `authenticate`.
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };

// Access tokens live 15 minutes and carry the role they were issued with. Staff routes re-read the
// account so a deactivated or demoted person loses access immediately, not when the token expires.
// Must run after `authenticate`; replaces `req.user` with the current role and area.
export const requireCurrentRole = (db, ...roles) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw unauthorized();
    const { rows } = await db.query(
      'SELECT role, area_id::int AS area_id, is_active FROM users WHERE id = $1',
      [req.user.id],
    );
    const account = rows[0];
    if (!account?.is_active) {
      throw new HttpError(401, 'INVALID_SESSION', 'Tu sesión expiró. Inicia sesión de nuevo.');
    }
    if (!roles.includes(account.role)) throw forbidden();
    req.user = { id: req.user.id, role: account.role, areaId: account.area_id };
    next();
  });

// Admins pass; authorities pass only when the resource belongs to their own area.
// `resolveAreaId(req)` returns the area id of the targeted resource (may be async).
export const requireArea = (resolveAreaId) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'authority' || req.user.areaId == null) throw forbidden();
    const resourceArea = await resolveAreaId(req);
    if (resourceArea == null || Number(resourceArea) !== Number(req.user.areaId)) throw forbidden();
    return next();
  });
