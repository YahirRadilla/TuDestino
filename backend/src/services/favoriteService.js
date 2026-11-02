import * as destinations from '../models/destinationModel.js';
import * as favorites from '../models/favoriteModel.js';
import { toListItem } from './destinationService.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Destino no encontrado.');

export async function listFavorites(db, userId, query) {
  const [rows, total] = await Promise.all([
    favorites.findByUser(db, userId, { limit: query.limit, offset: offsetOf(query) }),
    favorites.countByUser(db, userId),
  ]);
  return {
    data: rows.map((row) => ({ ...toListItem(row), favorited_at: row.favorited_at })),
    meta: buildMeta(query, total),
  };
}

// Idempotent. The counter is only recomputed when the row actually appeared or disappeared.
async function setFavorite(db, slug, userId, wanted) {
  return withTransaction(db, async (client) => {
    // Removing must keep working for a destination that was later unpublished.
    const destinationId = await destinations.lockBySlug(client, slug, { publishedOnly: wanted });
    if (!destinationId) throw notFound();
    const changed = wanted
      ? await favorites.insertIfAbsent(client, { userId, destinationId })
      : await favorites.deleteIfPresent(client, { userId, destinationId });
    const favoritesCount = changed
      ? await favorites.recomputeFavoritesCount(client, destinationId)
      : await favorites.readFavoritesCount(client, destinationId);
    return { changed, favoritesCount };
  });
}

export async function addFavorite(db, slug, userId) {
  const { changed, favoritesCount } = await setFavorite(db, slug, userId, true);
  return { data: { slug, favorited: true, changed }, meta: { favorites_count: favoritesCount } };
}

export async function removeFavorite(db, slug, userId) {
  const { changed, favoritesCount } = await setFavorite(db, slug, userId, false);
  return { data: { slug, favorited: false, changed }, meta: { favorites_count: favoritesCount } };
}
