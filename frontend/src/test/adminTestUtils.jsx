import { vi } from 'vitest';
import { Route } from 'react-router-dom';
import AdminLayout from '../features/admin/components/AdminLayout.jsx';
import AdminSummaryPage from '../features/admin/pages/AdminSummaryPage.jsx';
import DestinationsAdminPage from '../features/admin/pages/DestinationsAdminPage.jsx';
import EducationAdminPage from '../features/admin/pages/EducationAdminPage.jsx';
import EventsAdminPage from '../features/admin/pages/EventsAdminPage.jsx';
import ReportDetailPage from '../features/admin/pages/ReportDetailPage.jsx';
import AdminMapPage from '../features/map/pages/AdminMapPage.jsx';
import ReportsListPage from '../features/admin/pages/ReportsListPage.jsx';
import UsersAdminPage from '../features/admin/pages/UsersAdminPage.jsx';
import { RequireRole } from '../features/auth/components/RouteGuards.jsx';
import { renderWithAuth } from './renderWithAuth.jsx';
import { session, stubApi, testUser } from './apiStub.js';

// The /admin branch of App.jsx without lazy loading, so tests render real pages synchronously.
export const adminRoutes = () => [
  <Route key="login" path="login" element={<p>Pantalla de login</p>} />,
  <Route
    key="admin"
    path="admin"
    element={
      <RequireRole roles={['authority', 'admin']}>
        <AdminLayout />
      </RequireRole>
    }
  >
    <Route index element={<AdminSummaryPage />} />
    <Route path="reportes" element={<ReportsListPage />} />
    <Route path="reportes/:id" element={<ReportDetailPage />} />
    <Route path="mapa" element={<AdminMapPage />} />
    <Route path="destinos" element={<DestinationsAdminPage />} />
    <Route path="eventos" element={<EventsAdminPage />} />
    <Route path="educacion" element={<EducationAdminPage />} />
    <Route
      path="usuarios"
      element={
        <RequireRole roles={['admin']}>
          <UsersAdminPage />
        </RequireRole>
      }
    />
  </Route>,
];

export const person = (role, overrides = {}) => ({
  ...testUser,
  id: `${role}-1`,
  full_name: role === 'admin' ? 'Admin Pérez' : 'Autoridad López',
  email: `${role}@example.com`,
  role,
  ...overrides,
});

// Makes `useIsDesktop()` answer `matches` (jsdom has no matchMedia).
export function stubDesktop(matches = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return () => {
    delete window.matchMedia;
  };
}

/**
 * Signs in as `role` and renders the admin routes at `route` with the given API stub routes.
 * Returns the stub (calls, fetchMock) plus the render result.
 */
export function renderAdmin(route, { role = 'authority', api = {}, user, signedIn = true } = {}) {
  if (signedIn) localStorage.setItem('td:session', '1');
  const stub = stubApi({
    ...(signedIn && { 'POST /auth/refresh': session(user ?? person(role)) }),
    ...api,
  });
  const view = renderWithAuth(adminRoutes(), { route });
  return { ...stub, ...view };
}

export const page = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, limit: 10, total: items.length, total_pages: 1, ...meta },
});

// Calls made with `method` that are not part of the session handshake (/auth/*).
export const sent = (calls, method) =>
  calls.filter((call) => call.method === method && !call.path.startsWith('/auth/'));
