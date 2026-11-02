import { apiFetch } from '../../api/client.js';

/** One page of the signed-in person's inbox plus the unread count (feeds the bell and the badge). */
export async function fetchNotifications({ page = 1, limit = 20, unread = false } = {}, signal) {
  return apiFetch('/me/notifications', {
    auth: true,
    params: { page, limit, unread: unread ? 'true' : undefined },
    signal,
  });
}

export const markNotificationRead = (id) =>
  apiFetch(`/me/notifications/${id}/read`, { method: 'PATCH', auth: true });

export const markAllNotificationsRead = () =>
  apiFetch('/me/notifications/read-all', { method: 'POST', auth: true });
