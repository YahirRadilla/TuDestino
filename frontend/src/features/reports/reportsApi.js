import { apiFetch } from '../../api/client.js';
import { normalizeCode, normalizeFolio } from './reportValidation.js';

export const fetchReportTypes = async (signal) => {
  const payload = await apiFetch('/report-types', { signal });
  return payload.data;
};

// 404 is the same answer for an unknown folio and for a wrong code (the API never says which).
export async function trackReport({ folio, code }, signal) {
  const payload = await apiFetch('/reports/track', {
    method: 'POST',
    body: { folio: normalizeFolio(folio), code: normalizeCode(code) },
    signal,
  });
  return payload.data;
}
