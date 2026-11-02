import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { MOBILE_TABS, REPORT_ITEM } from '../nav.js';
import { isTopLevel } from '../routes.js';
import { useOutbox } from '../../features/reports/useOutbox.js';

// Floating pill navigation (mobile). The active tab expands into a labeled pill. Reporting stays
// one tap away as a floating action button on the main screens.
export default function BottomNav() {
  const { pathname } = useLocation();
  const { count: pending } = useOutbox();
  const showReport = isTopLevel(pathname) && pathname !== REPORT_ITEM.to;
  return (
    <>
      {showReport && (
        <Link to={REPORT_ITEM.to} className="report-fab">
          <Icon name={REPORT_ITEM.icon} size={20} strong />
          <span>{REPORT_ITEM.label}</span>
          {pending > 0 && (
            <span className="badge nav-badge" role="img" aria-label={`${pending} pendientes de envío`}>
              {pending}
            </span>
          )}
        </Link>
      )}
      <nav className="bottom-nav" aria-label="Principal">
        {MOBILE_TABS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              className="bottom-nav__item"
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={20} strong={active} />
              <span className={active ? 'bottom-nav__label' : 'sr-only'}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
