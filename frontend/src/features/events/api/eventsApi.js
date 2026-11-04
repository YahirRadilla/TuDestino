import { ApiError, apiFetch } from '../../../api/client.js';
import { mirrorEvents } from '../../../storage/catalogCache.js';
import { freshnessParams } from '../../../storage/catalogFreshness.js';

const assertList = (payload) => {
  if (!Array.isArray(payload?.data)) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return payload;
};

// Upcoming published events. With a session the answer also says whether the user attends each
// one (`auth: 'optional'`: an expired token just gets the anonymous answer).
// Read-through: a complete list refreshes the IndexedDB mirror used offline.
export async function fetchEvents({ limit = 50 } = {}, signal) {
  const payload = assertList(
    await apiFetch('/events', { auth: 'optional', signal, params: { limit, ...freshnessParams() } }),
  );
  void mirrorEvents(payload.data, { complete: payload.data.length < limit });
  return payload.data;
}

// null when the event does not exist (or is not public).
export async function fetchEvent(id, signal) {
  try {
    const payload = await apiFetch(`/events/${encodeURIComponent(id)}`, {
      auth: 'optional',
      signal,
      params: freshnessParams(),
    });
    if (!payload?.data?.id) throw new ApiError('http', 'Respuesta inesperada del servidor.');
    void mirrorEvents([payload.data]);
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 404) return null;
    throw error;
  }
}

const attendance = (payload) => ({
  attending: Boolean(payload?.data?.attending),
  attendeesCount: payload?.meta?.attendees_count ?? 0,
});

export async function attendEvent(id) {
  return attendance(
    await apiFetch(`/events/${encodeURIComponent(id)}/attendance`, { auth: true, method: 'PUT' }),
  );
}

export async function cancelAttendance(id) {
  return attendance(
    await apiFetch(`/events/${encodeURIComponent(id)}/attendance`, { auth: true, method: 'DELETE' }),
  );
}

// scope: 'upcoming' | 'past' | 'all'
export async function fetchMyEvents(scope = 'upcoming', signal) {
  const payload = assertList(
    await apiFetch('/me/events', { auth: true, signal, params: { scope, limit: 50 } }),
  );
  return payload.data;
}

// RF20: a signed-in user proposes an event; it stays `pending` until staff approve it.
export async function proposeEvent(body) {
  const payload = await apiFetch('/events', { auth: true, method: 'POST', body });
  if (!payload?.data?.id) throw new ApiError('http', 'Respuesta inesperada del servidor.');
  return payload.data;
}

// The person's own proposals with their moderation status (and the reason when rejected).
export async function fetchMyProposals(signal) {
  const payload = assertList(
    await apiFetch('/me/events/proposed', { auth: true, signal, params: { limit: 50 } }),
  );
  return payload.data;
}
