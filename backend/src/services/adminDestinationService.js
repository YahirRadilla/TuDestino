import * as destinations from '../models/adminDestinationModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { isUniqueViolation, pickFreeSlug, slugify } from '../utils/slugify.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Destino no encontrado.');
const slugTaken = () =>
  new HttpError(409, 'SLUG_TAKEN', 'Ya existe un destino con ese identificador.');

const toListItem = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  status: row.status,
  municipality: row.municipality,
  is_protected_area: row.is_protected_area,
  category: { slug: row.category_slug, name: row.category_name },
  location: { lat: row.lat, lng: row.lng },
  images: row.images,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toDetail = (row) => ({
  ...toListItem(row),
  description: row.description,
  regulations: row.regulations,
  care_tips: row.care_tips,
});

async function categoryIdOf(db, slug) {
  const id = await destinations.findCategoryId(db, slug);
  if (!id) throw new HttpError(400, 'VALIDATION_ERROR', 'category: categoría desconocida');
  return id;
}

async function freeSlug(db, name) {
  const base = slugify(name);
  return pickFreeSlug(base, await destinations.findSlugsStartingWith(db, base));
}

export async function listDestinations(db, query) {
  const { page, limit, ...filters } = query;
  const [rows, total] = await Promise.all([
    destinations.findPage(db, { ...filters, limit, offset: offsetOf({ page, limit }) }),
    destinations.count(db, filters),
  ]);
  return { data: rows.map(toListItem), meta: buildMeta({ page, limit }, total) };
}

export async function getDestination(db, id) {
  const row = await destinations.findById(db, id);
  if (!row) throw notFound();
  return { data: toDetail(row) };
}

export async function createDestination(db, input, actor) {
  const categoryId = await categoryIdOf(db, input.category);
  const slug = input.slug ?? (await freeSlug(db, input.name));
  let id;
  try {
    id = await withTransaction(db, async (client) => {
      const created = await destinations.insert(client, {
        name: input.name,
        slug,
        summary: input.summary ?? '',
        description: input.description ?? '',
        categoryId,
        lat: input.lat,
        lng: input.lng,
        municipality: input.municipality ?? null,
        regulations: input.regulations ?? null,
        careTips: input.care_tips ?? [],
        isProtectedArea: input.is_protected_area ?? false,
        status: input.status ?? 'draft',
        createdBy: actor.id,
      });
      await destinations.replaceImages(client, created, input.images ?? []);
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return { id, data: (await getDestination(db, id)).data };
}

export async function updateDestination(db, id, input) {
  const changes = {};
  if (input.category !== undefined) changes.categoryId = await categoryIdOf(db, input.category);
  for (const [key, target] of [
    ['name', 'name'],
    ['slug', 'slug'],
    ['summary', 'summary'],
    ['description', 'description'],
    ['municipality', 'municipality'],
    ['regulations', 'regulations'],
    ['care_tips', 'careTips'],
    ['is_protected_area', 'isProtectedArea'],
    ['status', 'status'],
    ['lat', 'lat'],
    ['lng', 'lng'],
  ]) {
    if (input[key] !== undefined) changes[target] = input[key];
  }
  try {
    await withTransaction(db, async (client) => {
      if (!(await destinations.lockById(client, id))) throw notFound();
      await destinations.update(client, id, changes);
      if (input.images !== undefined) await destinations.replaceImages(client, id, input.images);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return getDestination(db, id);
}

// Soft delete: the row stays (reports, reviews and favorites keep their references) but it leaves
// every public listing and cannot be opened by its slug any more.
export async function deleteDestination(db, id) {
  if (!(await destinations.softDelete(db, id))) throw notFound();
}
