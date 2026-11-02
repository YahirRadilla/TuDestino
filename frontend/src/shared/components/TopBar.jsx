import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import SearchBar from './SearchBar.jsx';
import InstallButton from './InstallButton.jsx';
import NotificationsButton from './NotificationsButton.jsx';
import UserAvatar from '../../features/profile/components/UserAvatar.jsx';
import { useAuth } from '../../features/auth/authContext.js';
import { NAV_ITEMS } from '../nav.js';
import { useOutbox } from '../../features/reports/useOutbox.js';

// Web-style header (>= 768px): logo, primary links, search, notifications and account entry.
export default function TopBar() {
  const { pathname } = useLocation();
  const { status, user } = useAuth();
  const { count: pending } = useOutbox();
  const links = NAV_ITEMS.filter((item) => item.to !== '/perfil');
  const profileActive = NAV_ITEMS.at(-1).isActive(pathname);

  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <Logo />
        <nav className="topbar__nav" aria-label="Principal">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="topbar__link"
              aria-current={item.isActive(pathname) ? 'page' : undefined}
            >
              {item.label}
              {item.to === '/reportar' && pending > 0 && (
                <span className="badge nav-badge" role="img" aria-label={`${pending} pendientes de envío`}>
                  {pending}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="topbar__search">
          <SearchBar variant="compact" />
        </div>
        <div className="topbar__actions">
          <InstallButton variant="compact" />
          {user && <NotificationsButton />}
          {status === 'anonymous' ? (
            <Link to="/login" className="btn btn--primary topbar__login">
              Iniciar sesión
            </Link>
          ) : (
            <Link
              to="/perfil"
              className="icon-btn topbar__avatar"
              aria-label={user ? `Perfil de ${user.full_name}` : 'Perfil'}
              aria-current={profileActive ? 'page' : undefined}
            >
              {user ? <UserAvatar user={user} size={36} /> : <Icon name="user" size={20} />}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
