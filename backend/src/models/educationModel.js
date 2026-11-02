import { createQueryBuilder } from './sql.js';

const FROM_PUBLISHED = `
  FROM edu_contents ec
  JOIN edu_categories cat ON cat.id = ec.category_id`;

function buildFilters({ category, type, q }) {
  const builder = createQueryBuilder();
  builder.where('ec.is_published = true');
  builder.where('ec.deleted_at IS NULL');
  if (category) builder.where(`cat.slug = ${builder.bind(category)}`);
  if (type) builder.where(`ec.type = ${builder.bind(type)}`);
  let tsQuery = null;
  if (q) {
    tsQuery = `websearch_to_tsquery('spanish', ${builder.bind(q)})`;
    builder.where(`ec.search_vector @@ ${tsQuery}`);
  }
  return { builder, tsQuery };
}

export async function findPublished(db, { category, type, q, limit, offset }) {
  const { builder, tsQuery } = buildFilters({ category, type, q });
  const orderBy = tsQuery
    ? `ts_rank(ec.search_vector, ${tsQuery}) DESC, ec.published_at DESC`
    : 'ec.published_at DESC, ec.id ASC';
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT ec.slug, ec.title, ec.type, ec.body, ec.media_url, ec.cover_url,
       cat.slug AS category_slug, cat.name AS category_name, ec.published_at
     ${FROM_PUBLISHED} ${builder.whereClause()}
     ORDER BY ${orderBy} LIMIT ${limitParam} OFFSET ${offsetParam}`,
    builder.values,
  );
  return rows;
}

export async function countPublished(db, filters) {
  const { builder } = buildFilters(filters);
  const { rows } = await db.query(
    `SELECT count(*)::int AS total ${FROM_PUBLISHED} ${builder.whereClause()}`,
    builder.values,
  );
  return rows[0].total;
}

export async function findCategories(db) {
  const { rows } = await db.query('SELECT name, slug FROM edu_categories ORDER BY name ASC');
  return rows;
}
