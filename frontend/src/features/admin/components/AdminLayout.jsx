import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import { useAuth } from '../../auth/authContext.js';
import { ADMIN_NAV } from '../adminLabels.js';

// Shell of the staff panel: a sidebar from 1024px, a scrollable compact menu below. Entries the
// role cannot use are not rendered (the server enforces the same rules).
export default function AdminLayout() {
  const { user } = useAuth();
  const items = ADMIN_NAV.filter((item) => user && item.roles.includes(user.role));

  return (
    <div className="container page admin">
      <PageHeader title="Administración" />
      <div className="admin__layout">
        <nav className="admin-nav" aria-label="Secciones de administración">
          <ul className="admin-nav__list">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="admin-nav__link">
                  <Icon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <section className="admin__content" aria-label="Contenido de administración">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
