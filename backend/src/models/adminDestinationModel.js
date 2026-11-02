import { createQueryBuilder } from './sql.js';

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const SUMMARY_COLUMNS = `
  d.id, d.slug, d.name, d.summary, d.status, d.municipality, d.is_protected_area,
  c.slug AS category_slug, c.name AS category_name,
  ST_Y(d.location::geometry) AS lat, ST_X(d.location::geometry) AS lng,
  d.created_at, d.updated_at,
  COALESCE((
    SELECT json_agg(json_build_object('url', i.url, 'alt_text', i.alt_text) ORDER BY i.position)
    FROM destination_images i WHERE i.destination_id = d.id
  ), '[]'::json) AS images`;

const FROM = `
  FROM destinations d
  JOIN destination_categories c ON c.id = d.category_id`;

function buildFilters({ status, q }) {
  const builder = createQueryBuilder();
  builder.where('d.deleted_at IS NULL');
  if (status) builder.where(`d.status = ${builder.bind(status)}`);
  if (q) builder.where(`d.name ILIKE ${builder.bind(`%${escapeLike(q)}%`)} ESCAPE '\\'`);
  return builder;
}

export async function findPage(db, { status, q, limit, offset }) {
  const builder = buildFilters({ status, q });
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT ${SUMMARY_COLUMNS} ${FROM} ${builder.whereClause()}
     ORDER BY d.updated_at DESC, d.id ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    builder.values,
  );
  return rows;
}

export async function count(db, filters) {
  const builder = buildFilters(filters);
  const { rows } = await db.query(
    `SELECT count(*)::int AS total ${FROM} ${builder.whereClause()}`,
    builder.values,
  );
  return rows[0].total;
}

export async function findById(db, id) {
  const { rows } = await db.query(
    `SELECT ${SUMMARY_COLUMNS}, d.description, d.regulations, d.care_tips
     ${FROM} WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findCategoryId(db, slug) {
  const { rows } = await db.query('SELECT id FROM destination_categories WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

// Slugs already taken by `base` or `base-N`, soft-deleted rows included (the column is UNIQUE).
export async function findSlugsStartingWith(db, base) {
  const { rows } = await db.query(
    `SELECT slug FROM destinations WHERE slug = $1 OR slug LIKE $2 ESCAPE '\\'`,
    [base, `${escapeLike(base)}-%`],
  );
  return rows.map((row) => row.slug);
}

export async function insert(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO destinations (
       name, slug, summary, description, category_id, location, municipality, regulations,
       care_tips, is_protected_area, status, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6::float8, $7::float8), 4326)::geography,
       $8, $9, $10::text[], $11, $12, $13
     ) RETURNING id`,
    [
      fields.name,
      fields.slug,
      fields.summary,
      fields.description,
      fields.categoryId,
      fields.lng,
      fields.lat,
      fields.municipality,
      fields.regulations,
      fields.careTips,
      fields.isProtectedArea,
      fields.status,
      fields.createdBy,
    ],
  );
  return rows[0].id;
}

export async function lockById(client, id) {
  const { rows } = await client.query(
    'SELECT id FROM destinations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  return rows[0]?.id ?? null;
}

const SIMPLE_COLUMNS = {
  name: 'name',
  slug: 'slug',
  summary: 'summary',
  description: 'description',
  categoryId: 'category_id',
  municipality: 'municipality',
  regulations: 'regulations',
  careTips: 'care_tips',
  isProtectedArea: 'is_protected_area',
  status: 'status',
};

// `changes` keys are matched against a fixed whitelist; values are always bound.
export async function update(client, id, changes) {
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(SIMPLE_COLUMNS)) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}${key === 'careTips' ? '::text[]' : ''}`);
    }
  }
  if (Object.hasOwn(changes, 'lat')) {
    values.push(changes.lng, changes.lat);
    sets.push(
      `location = ST_SetSRID(ST_MakePoint($${values.length - 1}::float8, $${values.length}::float8), 4326)::geography`,
    );
  }
  if (sets.length === 0) return;
  await client.query(`UPDATE destinations SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function replaceImages(client, destinationId, images) {
  await client.query('DELETE FROM destination_images WHERE destination_id = $1', [destinationId]);
  for (const [position, image] of images.entries()) {
    await client.query(
      `INSERT INTO destination_images (destination_id, url, alt_text, position)
       VALUES ($1, $2, $3, $4)`,
      [destinationId, image.url, image.alt_text ?? null, position],
    );
  }
}

export async function softDelete(db, id) {
  const { rowCount } = await db.query(
    'UPDATE destinations SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return rowCount > 0;
}
