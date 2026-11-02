import { ApiError, apiFetch } from '../../../api/client.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

// Every favorite of the signed-in user as raw API destinations (pages are followed to the end).
export async function fetchMyFavorites(signal) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await apiFetch('/me/favorites', {
      auth: true,
      signal,
      params: { page, limit: PAGE_SIZE },
    });
    if (!Array.isArray(payload?.data)) {
      throw new ApiError('http', 'Respuesta inesperada del servidor.');
    }
    items.push(...payload.data);
    if (page >= (payload.meta?.total_pages ?? 1)) break;
  }
  return items;
}

const target = (slug) => `/me/favorites/${encodeURIComponent(slug)}`;
export const addFavoriteRemote = (slug) => apiFetch(target(slug), { auth: true, method: 'PUT' });
export const removeFavoriteRemote = (slug) => apiFetch(target(slug), { auth: true, method: 'DELETE' });
