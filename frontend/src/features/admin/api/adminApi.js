import { ApiError, apiFetch } from '../../../api/client.js';

// Staff panel calls. Everything needs a session and is network-only (never cached by the service
// worker, never mirrored on the device): `auth: true` renews the access token once on a 401.

const assertData = (payload) => {
  if (!payload || payload.data === undefined) {
    throw new ApiError('http', 'Respuesta inesperada del servidor.');
  }
  return payload.data;
};

const assertList = (payload) => {
  if (!Array.isArray(payload?.data)) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return {
    items: payload.data,
    meta: payload.meta ?? { page: 1, total_pages: 1, total: payload.data.length },
  };
};

const call = (path, options = {}) => apiFetch(path, { auth: true, ...options });
const send = (method, path, body) => call(path, { method, body });

// ----- summary -----
export const fetchSummary = async (signal) => assertData(await call('/admin/summary', { signal }));

// ----- reports -----
export const fetchReports = async (params, signal) =>
  assertList(await call('/admin/reports', { signal, params }));
export const fetchReport = async (id, signal) =>
  assertData(await call(`/admin/reports/${encodeURIComponent(id)}`, { signal }));
export const changeReportStatus = async (id, { status, note }) =>
  assertData(await send('PATCH', `/admin/reports/${encodeURIComponent(id)}/status`, { status, note }));

// `downloadPath` comes from the report detail (relative to the API base). Returns a Blob.
export const fetchEvidenceBlob = (downloadPath, signal) =>
  call(downloadPath, { signal, responseType: 'blob', timeoutMs: 20_000 });

// ----- destinations -----
export const fetchAdminDestinations = async (params, signal) =>
  assertList(await call('/admin/destinations', { signal, params }));
export const fetchAdminDestination = async (id, signal) =>
  assertData(await call(`/admin/destinations/${encodeURIComponent(id)}`, { signal }));
export const createDestination = async (body) => assertData(await send('POST', '/admin/destinations', body));
export const updateDestination = async (id, body) =>
  assertData(await send('PATCH', `/admin/destinations/${encodeURIComponent(id)}`, body));
export const deleteDestination = (id) => send('DELETE', `/admin/destinations/${encodeURIComponent(id)}`);
export const fetchDestinationCategories = async (signal) =>
  assertData(await apiFetch('/destination-categories', { signal }));

// ----- events -----
export const fetchAdminEvents = async (params, signal) =>
  assertList(await call('/admin/events', { signal, params }));
export const fetchAdminEvent = async (id, signal) =>
  assertData(await call(`/admin/events/${encodeURIComponent(id)}`, { signal }));
export const createEvent = async (body) => assertData(await send('POST', '/admin/events', body));
export const updateEvent = async (id, body) =>
  assertData(await send('PATCH', `/admin/events/${encodeURIComponent(id)}`, body));
export const deleteEvent = (id) => send('DELETE', `/admin/events/${encodeURIComponent(id)}`);
// action: 'approve' | 'reject' | 'cancel'; reject needs a reason.
export const moderateEvent = async (id, { action, reason }) =>
  assertData(
    await send('PATCH', `/admin/events/${encodeURIComponent(id)}/moderation`, {
      action,
      ...(reason ? { reason } : {}),
    }),
  );

// ----- education -----
export const fetchAdminEdu = async (params, signal) =>
  assertList(await call('/admin/edu-contents', { signal, params }));
export const fetchAdminEduContent = async (id, signal) =>
  assertData(await call(`/admin/edu-contents/${encodeURIComponent(id)}`, { signal }));
export const createEduContent = async (body) => assertData(await send('POST', '/admin/edu-contents', body));
export const updateEduContent = async (id, body) =>
  assertData(await send('PATCH', `/admin/edu-contents/${encodeURIComponent(id)}`, body));
export const deleteEduContent = (id) => send('DELETE', `/admin/edu-contents/${encodeURIComponent(id)}`);
export const fetchEduCategories = async (signal) => assertData(await apiFetch('/edu-categories', { signal }));

// ----- users (admin only) -----
export const fetchUsers = async (params, signal) =>
  assertList(await call('/admin/users', { signal, params }));
export const fetchAreas = async (signal) => assertData(await call('/admin/areas', { signal }));
// Resolves to { user, invitationSent }.
export async function createUser(body) {
  const payload = await send('POST', '/admin/users', body);
  return { user: assertData(payload), invitationSent: Boolean(payload.meta?.invitation_sent) };
}
export const updateUser = async (id, body) =>
  assertData(await send('PATCH', `/admin/users/${encodeURIComponent(id)}`, body));
export async function resendInvitation(id) {
  const payload = await send('POST', `/admin/users/${encodeURIComponent(id)}/invitation`);
  return { user: assertData(payload), invitationSent: Boolean(payload.meta?.invitation_sent) };
}
