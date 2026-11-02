import { useCallback, useEffect, useRef, useState } from 'react';
import { urlBase64ToUint8Array } from '../../pwa/push.js';
import { deleteSubscription, fetchPublicKey, saveSubscription } from './pushApi.js';
import { currentPermission, getPushSupport } from './pushSupport.js';

// Other mounted hooks (profile switch, bell, report follow button) refresh when this fires.
export const PUSH_CHANGED_EVENT = 'td:push-changed';
const READY_TIMEOUT_MS = 4000;

// `serviceWorker.ready` never settles when no worker is registered (dev server, blocked storage).
export async function getRegistration(nav = navigator, timeoutMs = READY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([nav.serviceWorker.ready, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function pushErrorMessage(error) {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (error?.message === 'NO_WORKER') {
    return 'La app aún no está lista para los avisos. Recarga la página e inténtalo otra vez.';
  }
  if (error?.name === 'NotAllowedError') {
    return 'El navegador no permitió activar los avisos. Revisa los permisos del sitio.';
  }
  return 'No pudimos activar los avisos en este dispositivo. Inténtalo de nuevo.';
}

/**
 * Push state of THIS device and the two actions around it.
 * status: 'checking' | 'unsupported' | 'ios-install' | 'denied' | 'idle' | 'subscribed'.
 *
 * `subscribe()` must be called from a click: the permission prompt is requested first, before any
 * await, because browsers (Safari above all) only show it inside a user gesture.
 */
export function usePush() {
  const [support] = useState(() => getPushSupport());
  const [permission, setPermission] = useState(() => currentPermission());
  const [subscription, setSubscription] = useState(null);
  const [checking, setChecking] = useState(support.kind === 'ready');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (support.kind !== 'ready') return;
    const registration = await getRegistration();
    const current = registration ? await registration.pushManager.getSubscription() : null;
    if (!mounted.current) return;
    setSubscription(current);
    setPermission(currentPermission());
    setChecking(false);
  }, [support.kind]);

  useEffect(() => {
    refresh().catch(() => mounted.current && setChecking(false));
    const onChanged = () => refresh().catch(() => {});
    window.addEventListener(PUSH_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PUSH_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      let result = currentPermission();
      if (result === 'default') result = await window.Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return null;
      const registration = await getRegistration();
      if (!registration) throw new Error('NO_WORKER');
      let current = await registration.pushManager.getSubscription();
      if (!current) {
        const key = await fetchPublicKey();
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      await saveSubscription(current);
      if (mounted.current) setSubscription(current);
      window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));
      return current;
    } catch (failure) {
      if (mounted.current) setError(pushErrorMessage(failure));
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    setBusy(true);
    setError('');
    try {
      // The server forgets the device first (it needs the subscription's own secret). If that
      // fails the browser still drops it: the push service answers 410 and the server cleans up.
      await deleteSubscription(subscription).catch(() => {});
      await subscription.unsubscribe();
      if (mounted.current) setSubscription(null);
      window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));
    } catch (failure) {
      if (mounted.current) setError(pushErrorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [subscription]);

  let status;
  if (support.kind !== 'ready') status = support.kind;
  else if (checking) status = 'checking';
  else if (subscription && permission === 'granted') status = 'subscribed';
  else if (permission === 'denied') status = 'denied';
  else status = 'idle';

  return {
    status,
    permission,
    subscribed: status === 'subscribed',
    endpoint: subscription?.endpoint ?? null,
    busy,
    error,
    subscribe,
    unsubscribe,
  };
}
