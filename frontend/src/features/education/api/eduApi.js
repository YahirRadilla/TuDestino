import { ApiError, apiFetch } from '../../../api/client.js';
import { mirrorEdu } from '../../../storage/catalogCache.js';

const assertList = (payload) => {
  if (!Array.isArray(payload?.data)) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return payload.data;
};

// Read-through: an unfiltered list shorter than the page size is the whole library and
// replaces the IndexedDB mirror used offline.
export async function fetchEduContents({ category, type, q, limit = 50 } = {}, signal) {
  const items = assertList(await apiFetch('/edu-contents', { signal, params: { category, type, q, limit } }));
  void mirrorEdu(items, { complete: !category && !type && !q && items.length < limit });
  return items;
}

export async function fetchEduCategories(signal) {
  return assertList(await apiFetch('/edu-categories', { signal }));
}
