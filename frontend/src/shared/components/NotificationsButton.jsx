import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useNotifications } from '../../features/notifications/notificationsContext.js';

const MAX_SHOWN = 99;

// The bell: opens the inbox and shows the real unread count. The visible number is decorative; the
// link's accessible name carries the same information in words.
export default function NotificationsButton() {
  const { unreadCount } = useNotifications();
  const label =
    unreadCount === 0 ? 'Notificaciones, sin novedades' : `Notificaciones, ${unreadCount} sin leer`;
  return (
    <Link to="/notificaciones" className="icon-btn icon-btn--badge" aria-label={label}>
      <Icon name="bell" size={20} />
      {unreadCount > 0 && (
        <span className="badge" aria-hidden="true">
          {unreadCount > MAX_SHOWN ? `${MAX_SHOWN}+` : unreadCount}
        </span>
      )}
    </Link>
  );
}
