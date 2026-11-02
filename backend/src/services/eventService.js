import * as events from '../models/eventModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Evento no encontrado.');

const toEvent = (row) => ({
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
  attendees_count: row.attendees_count,
  // Only present when the request carried a valid session.
  ...(row.attending !== undefined && { attending: row.attending }),
});

export async function listUpcomingEvents(db, query, userId = null) {
  const { page, limit } = query;
  const [rows, total] = await Promise.all([
    events.findUpcoming(db, { limit, offset: offsetOf(query), userId }),
    events.countUpcoming(db),
  ]);
  return { data: rows.map(toEvent), meta: buildMeta({ page, limit }, total) };
}

export async function getEvent(db, id, userId = null) {
  const row = await events.findPublishedById(db, id, userId);
  if (!row) throw notFound();
  return { data: toEvent(row), meta: {} };
}

export async function attend(db, id, userId) {
  await withTransaction(db, async (client) => {
    const event = await events.lockPublishedForAttendance(client, id);
    if (!event) throw notFound();
    if (!event.is_open) {
      throw new HttpError(409, 'EVENT_NOT_OPEN', 'Este evento ya terminó.');
    }
    await events.insertAttendance(client, { userId, eventId: id });
  });
  return attendanceResult(db, id, true);
}

export async function unattend(db, id, userId) {
  if (!(await events.findExistingId(db, id))) throw notFound();
  await events.deleteAttendance(db, { userId, eventId: id });
  return attendanceResult(db, id, false);
}

async function attendanceResult(db, id, attending) {
  return {
    data: { event_id: id, attending },
    meta: { attendees_count: await events.countAttendees(db, id) },
  };
}

export async function listMyEvents(db, userId, query) {
  const { scope, limit } = query;
  const [rows, total] = await Promise.all([
    events.findAttendedBy(db, userId, { scope, limit, offset: offsetOf(query) }),
    events.countAttendedBy(db, userId, scope),
  ]);
  return { data: rows.map(toEvent), meta: buildMeta(query, total) };
}
