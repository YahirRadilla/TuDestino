import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { useSession } from '../../auth/authContext.js';
import { fetchEvent, fetchEvents, fetchMyEvents, fetchMyProposals } from '../api/eventsApi.js';
import { loadEventOffline, loadEventsOffline } from '../data/offlineEvents.js';

// The answer depends on who is asking (`attending`), so the request waits for the session to be
// known and is repeated when the person changes.
export function useEvents() {
  const { status, user } = useSession();
  return useRemoteData({
    key: `events:${user?.id ?? 'anon'}`,
    enabled: status !== 'loading',
    load: (signal) => fetchEvents({}, signal),
    fallback: () => loadEventsOffline(),
  });
}

// data is the event, or null when it does not exist.
export function useEvent(id) {
  const { status, user } = useSession();
  return useRemoteData({
    key: `event:${id}:${user?.id ?? 'anon'}`,
    enabled: status !== 'loading',
    load: (signal) => fetchEvent(id, signal),
    fallback: () => loadEventOffline(id),
  });
}

// "Mis eventos": needs the network (it is the account's data), no device fallback.
export function useMyEvents(scope) {
  return useRemoteData({
    key: `my-events:${scope}`,
    load: (signal) => fetchMyEvents(scope, signal),
  });
}

// "Mis propuestas": account data, so it needs the network.
export function useMyProposals() {
  return useRemoteData({ key: 'my-proposals', load: (signal) => fetchMyProposals(signal) });
}
