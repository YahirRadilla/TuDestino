import * as events from '../models/adminEventModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Evento no encontrado.');

// What each moderation action does and from which statuses it may start (D-01).
export const MODERATION = Object.freeze({
  approve: { from: ['pending'], to: 'published' },
  reject: { from: ['pending'], to: 'rejected' },
  cancel: { from: ['pending', 'published'], to: 'cancelled' },
});

const toAdminEvent = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  location_name: row.location_name,
  location: row.lat == null ? null : { lat: row.lat, lng: row.lng },
  destination_slug: row.destination_slug,
  image_url: row.image_url,
  capacity: row.capacity,
  status: row.status,
  moderation_note: row.moderation_note,
  moderated_at: row.moderated_at,
  organizer: row.organizer_name ? { full_name: row.organizer_name } : null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toProposal = (row) => ({
  id: row.id,
  title: row.title,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  location_name: row.location_name,
  status: row.status,
  moderation_note: row.moderation_note,
  moderated_at: row.moderated_at,
  created_at: row.created_at,
});

async function destinationIdOf(db, slug) {
  if (!slug) return null;
  const id = await events.findDestinationId(db, slug);
  if (!id) throw new HttpError(400, 'VALIDATION_ERROR', 'destination_slug: destino desconocido');
  return id;
}

async function insertEvent(db, input, { status, organizerId }) {
  return events.insert(db, {
    title: input.title,
    description: input.description ?? '',
    startsAt: input.starts_at,
    endsAt: input.ends_at ?? null,
    locationName: input.location_name ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    destinationId: await destinationIdOf(db, input.destination_slug),
    imageUrl: input.image_url ?? null,
    capacity: input.capacity ?? null,
    organizerId,
    status,
  });
}

export async function listEvents(db, query) {
  const { page, limit, ...filters } = query;
  const [rows, total] = await Promise.all([
    events.findPage(db, { ...filters, limit, offset: offsetOf({ page, limit }) }),
    events.count(db, filters),
  ]);
  return { data: rows.map(toAdminEvent), meta: buildMeta({ page, limit }, total) };
}

export async function getEvent(db, id) {
  const row = await events.findById(db, id);
  if (!row) throw notFound();
  return { data: toAdminEvent(row) };
}

// Staff create events already published.
export async function createEvent(db, input, actor) {
  const id = await insertEvent(db, input, { status: 'published', organizerId: actor.id });
  return { id, data: (await getEvent(db, id)).data };
}

// A signed-in user proposes an event: it waits as `pending` until staff approve it (RF20).
export async function proposeEvent(db, input, user) {
  const id = await insertEvent(db, input, { status: 'pending', organizerId: user.id });
  return { id, data: toProposal(await events.findById(db, id)) };
}

export async function updateEvent(db, id, input) {
  const changes = {};
  for (const [key, target] of [
    ['title', 'title'],
    ['description', 'description'],
    ['starts_at', 'startsAt'],
    ['ends_at', 'endsAt'],
    ['location_name', 'locationName'],
    ['image_url', 'imageUrl'],
    ['capacity', 'capacity'],
    ['lat', 'lat'],
    ['lng', 'lng'],
  ]) {
    if (input[key] !== undefined) changes[target] = input[key];
  }
  if (input.destination_slug !== undefined) {
    changes.destinationId = await destinationIdOf(db, input.destination_slug);
  }
  // A clear of one coordinate clears the point: both or none, like the create validator.
  if ((changes.lat === undefined) !== (changes.lng === undefined)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'lat: lat y lng deben indicarse juntos');
  }
  await withTransaction(db, async (client) => {
    const current = await events.lockById(client, id);
    if (!current) throw notFound();
    const startsAt = changes.startsAt ?? current.starts_at;
    const endsAt = changes.endsAt !== undefined ? changes.endsAt : current.ends_at;
    if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'ends_at: no puede ser anterior a starts_at');
    }
    await events.update(client, id, changes);
  });
  return getEvent(db, id);
}

export async function deleteEvent(db, id) {
  if (!(await events.softDelete(db, id))) throw notFound();
}

export async function moderateEvent(db, id, { action, reason }, actor) {
  const rule = MODERATION[action];
  await withTransaction(db, async (client) => {
    const current = await events.lockById(client, id);
    if (!current) throw notFound();
    const moved =
      rule.from.includes(current.status) &&
      (await events.moderate(client, id, {
        from: rule.from,
        status: rule.to,
        note: reason ?? null,
        moderatorId: actor.id,
      }));
    if (!moved) {
      throw new HttpError(
        409,
        'INVALID_TRANSITION',
        `No se puede aplicar "${action}" a un evento en estado "${current.status}".`,
      );
    }
  });
  return getEvent(db, id);
}

export const countPendingEvents = (db) => events.countPending(db);

export async function listMyProposals(db, userId, query) {
  const { page, limit } = query;
  const [rows, total] = await Promise.all([
    events.findProposedBy(db, userId, { limit, offset: offsetOf({ page, limit }) }),
    events.countProposedBy(db, userId),
  ]);
  return { data: rows.map(toProposal), meta: buildMeta({ page, limit }, total) };
}
