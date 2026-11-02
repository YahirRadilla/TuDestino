import { createQueryBuilder } from './sql.js';

const POINT_FROM = (lng, lat) => `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

export const LIST_COLUMNS = `
  d.id, d.slug, d.name, d.summary, d.municipality, d.is_protected_area,
  d.avg_rating::float8 AS avg_rating, d.reviews_count,
  c.slug AS category_slug, c.name AS category_name,
  ST_Y(d.location::geometry) AS lat, ST_X(d.location::geometry) AS lng,
  COALESCE((
    SELECT json_agg(json_build_object('url', i.url, 'alt_text', i.alt_text) ORDER BY i.position)
    FROM destination_images i WHERE i.destination_id = d.id
  ), '[]'::json) AS images`;

export const FROM_PUBLISHED = `
  FROM destinations d
  JOIN destination_categories c ON c.id = d.category_id`;

function buildFilters({ category, q }) {
  const builder = createQueryBuilder();
  builder.where(`d.status = 'published'`);
  builder.where('d.deleted_at IS NULL');
  if (category) builder.where(`c.slug = ${builder.bind(category)}`);
  let tsQuery = null;
  if (q) {
    tsQuery = `websearch_to_tsquery('spanish', ${builder.bind(q)})`;
    builder.where(`d.search_vector @@ ${tsQuery}`);
  }
  return { builder, tsQuery };
}

export async function findPublished(db, { category, q, near, limit, offset }) {
  const { builder, tsQuery } = buildFilters({ category, q });
  let distanceColumn = '';
  let orderBy = 'd.avg_rating DESC, d.name ASC';
  if (near) {
    const point = POINT_FROM(builder.bind(near.lng), builder.bind(near.lat));
    distanceColumn = `, ST_Distance(d.location, ${point}) / 1000 AS distance_km`;
    orderBy = 'distance_km ASC, d.name ASC';
  } else if (tsQuery) {
    orderBy = `ts_rank(d.search_vector, ${tsQuery}) DESC, d.name ASC`;
  }
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const text = `SELECT ${LIST_COLUMNS}${distanceColumn} ${FROM_PUBLISHED}
    ${builder.whereClause()} ORDER BY ${orderBy} LIMIT ${limitParam} OFFSET ${offsetParam}`;
  const { rows } = await db.query(text, builder.values);
  return rows;
}

export async function countPublished(db, { category, q }) {
  const { builder } = buildFilters({ category, q });
  const { rows } = await db.query(
    `SELECT count(*)::int AS total ${FROM_PUBLISHED} ${builder.whereClause()}`,
    builder.values,
  );
  return rows[0].total;
}

export async function findPublishedBySlug(db, slug) {
  const { rows } = await db.query(
    `SELECT ${LIST_COLUMNS}, d.description, d.regulations, d.care_tips, d.highlights
     ${FROM_PUBLISHED}
     WHERE d.slug = $1 AND d.status = 'published' AND d.deleted_at IS NULL`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function findCategories(db) {
  const { rows } = await db.query(
    'SELECT name, slug FROM destination_categories ORDER BY name ASC',
  );
  return rows;
}

// Locks the destination row until the surrounding transaction ends. Writers that recompute the
// denormalised counters (rating, reviews, favorites) take it first so they never interleave.
export async function lockBySlug(client, slug, { publishedOnly = true } = {}) {
  const { rows } = await client.query(
    `SELECT id FROM destinations
     WHERE slug = $1 AND deleted_at IS NULL${publishedOnly ? " AND status = 'published'" : ''}
     FOR UPDATE`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

export async function findPublishedId(db, slug) {
  const { rows } = await db.query(
    `SELECT id FROM destinations WHERE slug = $1 AND status = 'published' AND deleted_at IS NULL`,
    [slug],
  );
  return rows[0]?.id ?? null;
}
