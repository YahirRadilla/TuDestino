import { createQueryBuilder } from './sql.js';

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const COLUMNS = `
  ec.id, ec.slug, ec.title, ec.type, ec.body, ec.media_url, ec.cover_url,
  cat.slug AS category_slug, cat.name AS category_name,
  ec.is_published, ec.published_at, ec.created_at, ec.updated_at`;

const FROM = `
  FROM edu_contents ec
  JOIN edu_categories cat ON cat.id = ec.category_id`;

function buildFilters({ published, type, q }) {
  const builder = createQueryBuilder();
  builder.where('ec.deleted_at IS NULL');
  if (published) builder.where(`ec.is_published = ${builder.bind(published === 'true')}`);
  if (type) builder.where(`ec.type = ${builder.bind(type)}`);
  if (q) builder.where(`ec.title ILIKE ${builder.bind(`%${escapeLike(q)}%`)} ESCAPE '\\'`);
  return builder;
}

export async function findPage(db, { published, type, q, limit, offset }) {
  const builder = buildFilters({ published, type, q });
  const limitParam = builder.bind(limit);
  const offsetParam = builder.bind(offset);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} ${builder.whereClause()}
     ORDER BY ec.updated_at DESC, ec.id ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
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
    `SELECT ${COLUMNS} ${FROM} WHERE ec.id = $1 AND ec.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findCategoryId(db, slug) {
  const { rows } = await db.query('SELECT id FROM edu_categories WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

export async function findSlugsStartingWith(db, base) {
  const { rows } = await db.query(
    `SELECT slug FROM edu_contents WHERE slug = $1 OR slug LIKE $2 ESCAPE '\\'`,
    [base, `${escapeLike(base)}-%`],
  );
  return rows.map((row) => row.slug);
}

export async function insert(db, fields) {
  const { rows } = await db.query(
    `INSERT INTO edu_contents (
       title, slug, type, body, media_url, cover_url, category_id, author_id, is_published,
       published_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      fields.title,
      fields.slug,
      fields.type,
      fields.body,
      fields.mediaUrl,
      fields.coverUrl,
      fields.categoryId,
      fields.authorId,
      fields.isPublished,
    ],
  );
  return rows[0].id;
}

export async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT id, title, slug, type, media_url, is_published FROM edu_contents
     WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

const SIMPLE_COLUMNS = {
  title: 'title',
  slug: 'slug',
  type: 'type',
  body: 'body',
  mediaUrl: 'media_url',
  coverUrl: 'cover_url',
  categoryId: 'category_id',
};

// Publishing stamps `published_at` the first time only; unpublishing keeps it.
export async function update(client, id, changes) {
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(SIMPLE_COLUMNS)) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (Object.hasOwn(changes, 'isPublished')) {
    values.push(changes.isPublished);
    sets.push(
      `is_published = $${values.length}`,
      `published_at = CASE WHEN $${values.length} THEN COALESCE(published_at, now()) ELSE published_at END`,
    );
  }
  if (sets.length === 0) return;
  await client.query(`UPDATE edu_contents SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function softDelete(db, id) {
  const { rowCount } = await db.query(
    `UPDATE edu_contents SET deleted_at = now(), is_published = false
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rowCount > 0;
}
