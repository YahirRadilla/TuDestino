import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';
import TopBar from './TopBar.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import UpdateToast from './UpdateToast.jsx';
import { useIsDesktop } from '../hooks/useMediaQuery.js';
import FavoritesSync from '../../features/destinations/favorites/FavoritesSync.jsx';
import OutboxSync from '../../features/reports/OutboxSync.jsx';
import NotificationsProvider from '../../features/notifications/NotificationsProvider.jsx';

function Loading() {
  return (
    <div className="container page" role="status" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <div className="card-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export default function AppLayout() {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  // The destination detail has its own fixed CTA bar on mobile, so the floating nav steps aside.
  const showBottomNav = !isDesktop && !pathname.startsWith('/destinos/');

  return (
    <NotificationsProvider>
      <div className="app">
        <a className="skip-link" href="#main">
          Saltar al contenido
        </a>
        {isDesktop && <TopBar />}
        <main id="main" className={showBottomNav ? 'app__main app__main--with-nav' : 'app__main'}>
          <OfflineBanner />
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
        {showBottomNav && <BottomNav />}
        <UpdateToast />
        <FavoritesSync />
        <OutboxSync />
      </div>
    </NotificationsProvider>
  );
}
