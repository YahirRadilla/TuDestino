import * as edu from '../models/adminEduModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { isUniqueViolation, pickFreeSlug, slugify } from '../utils/slugify.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Contenido no encontrado.');

const toContent = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  type: row.type,
  body: row.body,
  media_url: row.media_url,
  cover_url: row.cover_url,
  category: { slug: row.category_slug, name: row.category_name },
  is_published: row.is_published,
  published_at: row.published_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Videos and links point somewhere; articles carry their own text.
export function assertConsistent({ type, media_url: mediaUrl }) {
  if ((type === 'video' || type === 'link') && !mediaUrl) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'media_url: los videos y enlaces necesitan una URL https',
    );
  }
}

async function categoryIdOf(db, slug) {
  const id = await edu.findCategoryId(db, slug);
  if (!id) throw new HttpError(400, 'VALIDATION_ERROR', 'category: categoría desconocida');
  return id;
}

const slugTaken = () =>
  new HttpError(409, 'SLUG_TAKEN', 'Ya existe un contenido con ese identificador.');

export async function listContents(db, query) {
  const { page, limit, ...filters } = query;
  const [rows, total] = await Promise.all([
    edu.findPage(db, { ...filters, limit, offset: offsetOf({ page, limit }) }),
    edu.count(db, filters),
  ]);
  return { data: rows.map(toContent), meta: buildMeta({ page, limit }, total) };
}

export async function getContent(db, id) {
  const row = await edu.findById(db, id);
  if (!row) throw notFound();
  return { data: toContent(row) };
}

export async function createContent(db, input, actor) {
  assertConsistent({ type: input.type, media_url: input.media_url });
  const categoryId = await categoryIdOf(db, input.category);
  const base = slugify(input.title);
  const slug = input.slug ?? pickFreeSlug(base, await edu.findSlugsStartingWith(db, base));
  let id;
  try {
    id = await edu.insert(db, {
      title: input.title,
      slug,
      type: input.type,
      body: input.body ?? '',
      mediaUrl: input.media_url ?? null,
      coverUrl: input.cover_url ?? null,
      categoryId,
      authorId: actor.id,
      isPublished: input.is_published ?? false,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return { id, data: (await getContent(db, id)).data };
}

export async function updateContent(db, id, input) {
  const changes = {};
  if (input.category !== undefined) changes.categoryId = await categoryIdOf(db, input.category);
  for (const [key, target] of [
    ['title', 'title'],
    ['slug', 'slug'],
    ['type', 'type'],
    ['body', 'body'],
    ['media_url', 'mediaUrl'],
    ['cover_url', 'coverUrl'],
    ['is_published', 'isPublished'],
  ]) {
    if (input[key] !== undefined) changes[target] = input[key];
  }
  try {
    await withTransaction(db, async (client) => {
      const current = await edu.lockById(client, id);
      if (!current) throw notFound();
      assertConsistent({
        type: changes.type ?? current.type,
        media_url: changes.mediaUrl !== undefined ? changes.mediaUrl : current.media_url,
      });
      await edu.update(client, id, changes);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return getContent(db, id);
}

export async function deleteContent(db, id) {
  if (!(await edu.softDelete(db, id))) throw notFound();
}
