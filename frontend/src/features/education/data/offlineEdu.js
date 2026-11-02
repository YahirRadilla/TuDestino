import { normalizeText } from '../../../shared/utils/share.js';
import { CachedData } from '../../../shared/hooks/useRemoteData.js';
import { readMirror } from '../../../storage/catalogCache.js';
import { STORES } from '../../../storage/db.js';

// Offline counterpart of GET /edu-contents: same filters, accent-insensitive text search.
export function filterEduContents(items, { category, type, q } = {}) {
  const needle = normalizeText(q ?? '');
  return items
    .filter(
      (item) =>
        (!category || item.category?.slug === category) &&
        (!type || item.type === type) &&
        (!needle || normalizeText(`${item.title} ${item.body ?? ''}`).includes(needle)),
    )
    .sort((a, b) => Date.parse(b.published_at ?? 0) - Date.parse(a.published_at ?? 0));
}

// undefined = nothing saved yet on this device (the original network error is shown).
export async function loadEduOffline(filters) {
  const { items, syncedAt } = await readMirror(STORES.edu);
  if (items.length === 0) return undefined;
  return new CachedData(filterEduContents(items, filters), syncedAt);
}

// Categories are derived from the saved articles, so no extra copy is needed.
export async function loadEduCategoriesOffline() {
  const { items, syncedAt } = await readMirror(STORES.edu);
  if (items.length === 0) return undefined;
  const bySlug = new Map(items.filter((i) => i.category).map((i) => [i.category.slug, i.category]));
  const categories = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return new CachedData(categories, syncedAt);
}
