import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyBadge, PUSH_RECEIVED_MESSAGE } from '../../pwa/push.js';
import { badgeStore } from '../../pwa/badgeStore.js';
import { useSession } from '../auth/authContext.js';
import { fetchNotifications } from './notificationsApi.js';
import { NotificationsContext } from './notificationsContext.js';
import { getRegistration } from './usePush.js';
import { getPushSupport } from './pushSupport.js';
import { saveSubscription } from './pushApi.js';

/**
 * Keeps three things in step (renders nothing visible):
 *  - the unread count behind the bell, refreshed on sign-in, when the app is shown again, when the
 *    connection returns and whenever the worker reports a push;
 *  - the app-icon badge (Badging API), mirrored from that count (cleared for visitors, who have no inbox);
 *  - the link between this device's push subscription and the signed-in account.
 */
export default function NotificationsProvider({ children }) {
  const { status, user } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const authed = status === 'authenticated';
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!authed) return;
    try {
      const payload = await fetchNotifications({ page: 1, limit: 1 });
      if (aliveRef.current) setUnreadCount(payload.unread_count ?? 0);
    } catch {
      // Offline or server down: keep the last known count.
    }
  }, [authed]);

  // Signing out empties the count; signing in (or the first load) fetches it.
  useEffect(() => {
    if (status === 'loading') return;
    if (!authed) setUnreadCount(0);
    else refreshUnread();
  }, [status, authed, refreshUnread]);

  useEffect(() => {
    if (!authed) return undefined;
    const onVisible = () => document.visibilityState === 'visible' && refreshUnread();
    const onWorkerMessage = (event) => event.data?.type === PUSH_RECEIVED_MESSAGE && refreshUnread();
    window.addEventListener('online', refreshUnread);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener?.('message', onWorkerMessage);
    return () => {
      window.removeEventListener('online', refreshUnread);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener?.('message', onWorkerMessage);
    };
  }, [authed, refreshUnread]);

  // Badging API: the number on the installed app's icon follows the unread count.
  useEffect(() => {
    if (status === 'loading') return;
    const count = authed ? unreadCount : 0;
    badgeStore.set(count).catch(() => {});
    applyBadge(navigator, count);
  }, [status, authed, unreadCount]);

  // The worker registers a rotated subscription anonymously; re-link this device to the account
  // (or detach it after sign-out) whenever the session changes.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (status === 'loading' || getPushSupport().kind !== 'ready') return undefined;
    let cancelled = false;
    const sync = async () => {
      const registration = await getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled && subscription) await saveSubscription(subscription);
    };
    sync().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  const value = useMemo(() => ({ unreadCount, setUnreadCount, refreshUnread }), [unreadCount, refreshUnread]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
