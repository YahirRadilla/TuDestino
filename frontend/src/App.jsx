import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './shared/components/AppLayout.jsx';
import { RequireAuth, RequireRole } from './features/auth/components/RouteGuards.jsx';
import AdminLayout from './features/admin/components/AdminLayout.jsx';

const HomePage = lazy(() => import('./features/destinations/pages/HomePage.jsx'));
const ExplorePage = lazy(() => import('./features/destinations/pages/ExplorePage.jsx'));
const DestinationDetailPage = lazy(() => import('./features/destinations/pages/DestinationDetailPage.jsx'));
const FavoritesPage = lazy(() => import('./features/destinations/pages/FavoritesPage.jsx'));
const EventsPage = lazy(() => import('./features/events/pages/EventsPage.jsx'));
const EventDetailPage = lazy(() => import('./features/events/pages/EventDetailPage.jsx'));
const MyEventsPage = lazy(() => import('./features/events/pages/MyEventsPage.jsx'));
const MyReviewsPage = lazy(() => import('./features/profile/pages/MyReviewsPage.jsx'));
const EducationPage = lazy(() => import('./features/education/pages/EducationPage.jsx'));
const ReportPage = lazy(() => import('./features/reports/pages/ReportPage.jsx'));
const PendingReportsPage = lazy(() => import('./features/reports/pages/PendingReportsPage.jsx'));
const TrackingPage = lazy(() => import('./features/reports/pages/TrackingPage.jsx'));
const MapPage = lazy(() => import('./features/map/pages/MapPage.jsx'));
const NotificationsPage = lazy(() => import('./features/notifications/pages/NotificationsPage.jsx'));
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage.jsx'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./features/auth/pages/ResetPasswordPage.jsx'));
const AdminSummaryPage = lazy(() => import('./features/admin/pages/AdminSummaryPage.jsx'));
const ReportsListPage = lazy(() => import('./features/admin/pages/ReportsListPage.jsx'));
const ReportDetailPage = lazy(() => import('./features/admin/pages/ReportDetailPage.jsx'));
const AdminMapPage = lazy(() => import('./features/map/pages/AdminMapPage.jsx'));
const DestinationsAdminPage = lazy(() => import('./features/admin/pages/DestinationsAdminPage.jsx'));
const EventsAdminPage = lazy(() => import('./features/admin/pages/EventsAdminPage.jsx'));
const EducationAdminPage = lazy(() => import('./features/admin/pages/EducationAdminPage.jsx'));
const UsersAdminPage = lazy(() => import('./features/admin/pages/UsersAdminPage.jsx'));
const ProposeEventPage = lazy(() => import('./features/events/pages/ProposeEventPage.jsx'));
const MyProposalsPage = lazy(() => import('./features/events/pages/MyProposalsPage.jsx'));
const NotFoundPage = lazy(() => import('./shared/pages/NotFoundPage.jsx'));

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="explorar" element={<ExplorePage />} />
        <Route path="destinos/:slug" element={<DestinationDetailPage />} />
        <Route path="favoritos" element={<FavoritesPage />} />
        <Route path="eventos" element={<EventsPage />} />
        <Route
          path="eventos/proponer"
          element={
            <RequireAuth>
              <ProposeEventPage />
            </RequireAuth>
          }
        />
        <Route path="eventos/:id" element={<EventDetailPage />} />
        <Route path="educacion" element={<EducationPage />} />
        <Route path="reportar" element={<ReportPage />} />
        <Route path="reportar/pendientes" element={<PendingReportsPage />} />
        <Route path="seguimiento" element={<TrackingPage />} />
        <Route path="mapa" element={<MapPage />} />
        <Route path="notificaciones" element={<NotificationsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route
          path="perfil/eventos"
          element={
            <RequireAuth>
              <MyEventsPage />
            </RequireAuth>
          }
        />
        <Route
          path="perfil/propuestas"
          element={
            <RequireAuth>
              <MyProposalsPage />
            </RequireAuth>
          }
        />
        <Route
          path="perfil/resenas"
          element={
            <RequireAuth>
              <MyReviewsPage />
            </RequireAuth>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="recuperar" element={<ForgotPasswordPage />} />
        <Route path="restablecer" element={<ResetPasswordPage />} />
        <Route
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
