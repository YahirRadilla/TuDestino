import * as education from '../models/educationModel.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';

const toContent = (row) => ({
  slug: row.slug,
  title: row.title,
  type: row.type,
  body: row.body,
  media_url: row.media_url,
  cover_url: row.cover_url,
  category: { slug: row.category_slug, name: row.category_name },
  published_at: row.published_at,
});

export async function listEduContents(db, query) {
  const { page, limit, category, type, q } = query;
  const [rows, total] = await Promise.all([
    education.findPublished(db, { category, type, q, limit, offset: offsetOf(query) }),
    education.countPublished(db, { category, type, q }),
  ]);
  return { data: rows.map(toContent), meta: buildMeta({ page, limit }, total) };
}

export async function listEduCategories(db) {
  const rows = await education.findCategories(db);
  return { data: rows.map(({ name, slug }) => ({ name, slug })), meta: {} };
}
