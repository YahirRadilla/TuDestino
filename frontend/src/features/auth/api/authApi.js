import { apiFetch } from '../../../api/client.js';

// Thin wrappers over /api/v1/auth and /api/v1/me. Credential endpoints never carry a bearer token.
export const login = ({ email, password }) =>
  apiFetch('/auth/login', { method: 'POST', body: { email, password } }).then((r) => r.data);

export const register = ({ full_name, email, password }) =>
  apiFetch('/auth/register', { method: 'POST', body: { full_name, email, password } }).then((r) => r.data);

export const refresh = () => apiFetch('/auth/refresh', { method: 'POST' }).then((r) => r.data);

export const logout = () => apiFetch('/auth/logout', { method: 'POST' });

export const forgotPassword = ({ email }) => apiFetch('/auth/forgot', { method: 'POST', body: { email } });

export const resetPassword = ({ token, password }) =>
  apiFetch('/auth/reset', { method: 'POST', body: { token, password } });

export const getMe = (options) => apiFetch('/me', { auth: true, ...options }).then((r) => r.data);

export const updateMe = (changes) =>
  apiFetch('/me', { auth: true, method: 'PATCH', body: changes }).then((r) => r.data);
