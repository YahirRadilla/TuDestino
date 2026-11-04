import { ApiError, apiFetch } from '../../../api/client.js';
import { freshnessParams } from '../../../storage/catalogFreshness.js';
import { adminReportMarker, destinationMarker, publicReportMarker } from '../mapModel.js';

// Public layer: anonymous, cacheable by the service worker (stale-while-revalidate).
export async function fetchPublicPins(signal) {
  const payload = await apiFetch('/map/pins', { signal, params: freshnessParams() });
  if (!Array.isArray(payload?.data?.destinations) || !Array.isArray(payload?.data?.reports)) {
    throw new ApiError('http', 'Respuesta inesperada del servidor.');
  }
  return {
    destinations: payload.data.destinations.map(destinationMarker),
    reports: payload.data.reports.map(publicReportMarker),
    truncated: Boolean(payload.meta?.truncated?.destinations || payload.meta?.truncated?.reports),
  };
}

// Staff layer: session required, exact coordinates, never cached or mirrored.
export async function fetchAdminPins({ status, type } = {}, signal) {
  const payload = await apiFetch('/admin/map/pins', {
    signal,
    auth: true,
    params: { status, type },
  });
  if (!Array.isArray(payload?.data?.reports)) {
    throw new ApiError('http', 'Respuesta inesperada del servidor.');
  }
  return {
    reports: payload.data.reports.map(adminReportMarker),
    truncated: Boolean(payload.meta?.truncated?.reports),
  };
}
