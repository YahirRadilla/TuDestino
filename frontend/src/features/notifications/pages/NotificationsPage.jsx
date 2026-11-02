import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import { useSession } from '../../auth/authContext.js';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../notificationsApi.js';
import { useNotifications } from '../notificationsContext.js';
import PushToggle from '../components/PushToggle.jsx';

const PAGE_SIZE = 20;

function NotificationItem({ item, onOpen }) {
  const content = (
    <>
      <span className={`inbox-item__dot ${item.read ? '' : 'is-unread'}`} aria-hidden="true" />
      <span className="inbox-item__text">
        <strong>{item.title}</strong>
        {item.body && <span className="inbox-item__body">{item.body}</span>}
        <time className="muted inbox-item__time" dateTime={item.created_at}>
          {formatSyncTime(item.created_at)}
        </time>
      </span>
      {!item.read && <span className="sr-only">(sin leer)</span>}
    </>
  );
  // A notification with a destination opens it (marking it read); one without just marks itself.
  return (
    <li className={`inbox-item ${item.read ? '' : 'inbox-item--unread'}`}>
      {item.url ? (
        <Link to={item.url} className="inbox-item__main" onClick={() => onOpen(item)}>
          {content}
        </Link>
      ) : (
        <button type="button" className="inbox-item__main" onClick={() => onOpen(item)}>
          {content}
        </button>
      )}
    </li>
  );
}

function SignedOutNotice() {
  return (
    <>
      <StateCard icon="bell" title="Inicia sesión para ver tus notificaciones">
        Aquí aparecen los cambios de estado de tus reportes y los avisos de tus eventos.
        <br />
        <Link to="/login" className="btn btn--primary">
          Iniciar sesión
        </Link>
      </StateCard>
      <p className="muted">
        ¿Hiciste un reporte sin cuenta? Activa los avisos en este dispositivo y sigue tu reporte con su folio
        en <Link to="/seguimiento">Seguimiento</Link>.
      </p>
      <PushToggle />
    </>
  );
}

// /notificaciones: the bell's destination. Signed-in people get their inbox; visitors get the way
// to sign in and the device-level switch for report follow-ups.
export default function NotificationsPage() {
  const { status } = useSession();
  const online = useOnlineStatus();
  const { setUnreadCount } = useNotifications();
  const [state, setState] = useState({ phase: 'loading', items: [], meta: null, error: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState('');
  const requestRef = useRef(null);
  const authed = status === 'authenticated';

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState((current) => ({ ...current, phase: current.items.length ? 'ready' : 'loading', error: false }));
    try {
      const payload = await fetchNotifications({ page: 1, limit: PAGE_SIZE }, controller.signal);
      if (controller.signal.aborted) return;
      setUnreadCount(payload.unread_count);
      setState({ phase: 'ready', items: payload.data, meta: payload.meta, error: false });
    } catch (error) {
      if (controller.signal.aborted || error?.kind === 'aborted') return;
      setState((current) => ({ ...current, phase: current.items.length ? 'ready' : 'error', error: true }));
    }
  }, [setUnreadCount]);

  useEffect(() => {
    if (authed) load();
    return () => requestRef.current?.abort();
  }, [authed, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    setNotice('');
    try {
      const payload = await fetchNotifications({ page: state.meta.page + 1, limit: PAGE_SIZE });
      setUnreadCount(payload.unread_count);
      setState((current) => ({
        ...current,
        items: [...current.items, ...payload.data.filter((n) => !current.items.some((i) => i.id === n.id))],
        meta: payload.meta,
      }));
    } catch {
      setNotice('No pudimos cargar más notificaciones.');
    } finally {
      setLoadingMore(false);
    }
  };

  const open = async (item) => {
    if (item.read) return;
    setState((current) => ({
      ...current,
      items: current.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
    }));
    try {
      const payload = await markNotificationRead(item.id);
      setUnreadCount(payload.unread_count);
    } catch {
      // The destination still opens; the item shows as unread again next time it loads.
    }
  };

  const markAll = async () => {
    setNotice('');
    try {
      const payload = await markAllNotificationsRead();
      setUnreadCount(payload.unread_count);
      setState((current) => ({ ...current, items: current.items.map((n) => ({ ...n, read: true })) }));
    } catch {
      setNotice('No pudimos marcar las notificaciones como leídas. Inténtalo de nuevo.');
    }
  };

  const unread = state.items.filter((item) => !item.read).length;
  const hasMore = state.meta && state.meta.page < state.meta.total_pages;

  return (
    <div className="container page inbox">
      <PageHeader title="Notificaciones" />

      {status === 'loading' ? (
        <div className="skeleton skeleton--card" aria-hidden="true" />
      ) : !authed ? (
        <SignedOutNotice />
      ) : (
        <>
          <PushToggle />

          {!online && (
            <p className="data-notice" role="status">
              <Icon name="wifiOff" size={16} /> Sin conexión · Mostramos lo último que cargamos.
            </p>
          )}

          {state.phase === 'loading' && (
            <div aria-busy="true" aria-label="Cargando notificaciones">
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </div>
          )}

          {state.phase === 'error' &&
            (online ? (
              <ErrorState title="No pudimos cargar tus notificaciones" onRetry={load} />
            ) : (
              <StateCard icon="wifiOff" title="Sin conexión">
                Conéctate para ver tus notificaciones.
              </StateCard>
            ))}

          {state.phase === 'ready' && state.items.length === 0 && (
            <StateCard icon="bell" title="No tienes notificaciones">
              Te avisaremos aquí cuando cambie el estado de tus reportes o se acerque un evento.
            </StateCard>
          )}

          {state.phase === 'ready' && state.items.length > 0 && (
            <>
              <div className="inbox__toolbar">
                <p className="muted" aria-live="polite">
                  {unread === 0 ? 'Todo al día' : `${unread} sin leer`}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={markAll}
                  disabled={unread === 0}
                >
                  <Icon name="check" size={16} /> Marcar todas como leídas
                </button>
              </div>
              <ul className="inbox__list" aria-label="Notificaciones">
                {state.items.map((item) => (
                  <NotificationItem key={item.id} item={item} onOpen={open} />
                ))}
              </ul>
              {notice && (
                <p className="form-alert" role="alert">
                  {notice}
                </p>
              )}
              {hasMore && (
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Cargando…' : 'Ver más'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
