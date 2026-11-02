import * as inbox from '../models/notificationModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';

const toItem = (row) => ({
  id: Number(row.id),
  type: row.type,
  title: row.title,
  body: row.body,
  url: row.url,
  read: row.read_at != null,
  read_at: row.read_at,
  created_at: row.created_at,
});

export async function listMine(db, userId, { page, limit, unread }) {
  const [rows, total, unreadCount] = await Promise.all([
    inbox.findPage(db, userId, { unreadOnly: unread, limit, offset: offsetOf({ page, limit }) }),
    inbox.count(db, userId, { unreadOnly: unread }),
    inbox.count(db, userId, { unreadOnly: true }),
  ]);
  return {
    data: rows.map(toItem),
    meta: buildMeta({ page, limit }, total),
    unread_count: unreadCount,
  };
}

// 404 for another person's notification, exactly as for a missing one.
export async function markRead(db, userId, id) {
  const row = await inbox.markRead(db, userId, id);
  if (!row) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notificación no encontrada.');
  return { data: toItem(row), unread_count: await inbox.count(db, userId, { unreadOnly: true }) };
}

export async function markAllRead(db, userId) {
  const updated = await inbox.markAllRead(db, userId);
  return { data: { updated }, unread_count: 0 };
}
