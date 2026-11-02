import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route } from 'react-router-dom';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { apiError, session, stubApi } from '../../../test/apiStub.js';
import NotificationsProvider from '../NotificationsProvider.jsx';
import NotificationsPage from './NotificationsPage.jsx';
import NotificationsButton from '../../../shared/components/NotificationsButton.jsx';

const item = (id, overrides = {}) => ({
  id,
  type: 'report_status',
  title: `Título ${id}`,
  body: `Cuerpo ${id}`,
  url: `/seguimiento?folio=TD-2026-00000${id}`,
  read: false,
  read_at: null,
  created_at: '2026-10-18T10:00:00.000Z',
  ...overrides,
});
const page = (data, { unread = data.filter((n) => !n.read).length, current = 1, pages = 1 } = {}) => ({
  data,
  meta: { page: current, limit: 20, total: data.length, total_pages: pages },
  unread_count: unread,
});

function renderPage() {
  return renderWithAuth(
    <Route
      element={
        <NotificationsProvider>
          <NotificationsButton />
          <Outlet />
        </NotificationsProvider>
      }
    >
      <Route path="notificaciones" element={<NotificationsPage />} />
      <Route path="seguimiento" element={<p>Pantalla de seguimiento</p>} />
    </Route>,
    { route: '/notificaciones' },
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('td:session', '1');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the sign-in prompt to visitors, with the device-level switch', async () => {
    localStorage.clear();
    stubApi({});
    renderPage();
    expect(await screen.findByText('Inicia sesión para ver tus notificaciones')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('lists notifications, marks unread ones and shows the count', async () => {
    stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': page([item(2), item(1, { read: true })], { unread: 1 }),
    });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Notificaciones' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('(sin leer)')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('(sin leer)')).not.toBeInTheDocument();
    expect(screen.getByText('1 sin leer')).toBeInTheDocument();
  });

  it('opens the destination and marks the notification as read', async () => {
    const api = stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': page([item(2), item(1)], { unread: 2 }),
      'PATCH /me/notifications/2/read': { data: item(2, { read: true }), unread_count: 1 },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Título 2/ }));
    expect(await screen.findByText('Pantalla de seguimiento')).toBeInTheDocument();
    expect(api.count('PATCH /me/notifications/2/read')).toBe(1);
    expect(await screen.findByRole('link', { name: 'Notificaciones, 1 sin leer' })).toBeInTheDocument();
  });

  it('does not call the server again for a notification that is already read', async () => {
    const api = stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': page([item(1, { read: true })], { unread: 0 }),
    });
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Título 1/ }));
    expect(api.calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('marks everything as read', async () => {
    const api = stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': page([item(2), item(1)], { unread: 2 }),
      'POST /me/notifications/read-all': { data: { updated: 2 }, unread_count: 0 },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Marcar todas como leídas/ }));
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(api.count('POST /me/notifications/read-all')).toBe(1);
    expect(screen.queryByText('(sin leer)')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Notificaciones, sin novedades' })).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    stubApi({ 'POST /auth/refresh': session(), 'GET /me/notifications': page([]) });
    renderPage();
    expect(await screen.findByText('No tienes notificaciones')).toBeInTheDocument();
  });

  it('shows an error with a retry that works', async () => {
    let fail = true;
    stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': () =>
        fail ? apiError(500, 'INTERNAL', 'boom') : page([item(1)], { unread: 1 }),
    });
    renderPage();
    expect(await screen.findByText('No pudimos cargar tus notificaciones')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('link', { name: /Título 1/ })).toBeInTheDocument();
  });

  it('says so when the connection drops and nothing was loaded yet', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    try {
      stubApi({
        'POST /auth/refresh': session(),
        'GET /me/notifications': () => {
          online.mockReturnValue(false);
          window.dispatchEvent(new Event('offline'));
          return Promise.reject(new TypeError('Failed to fetch'));
        },
      });
      renderPage();
      expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
      expect(screen.getByText(/Conéctate para ver tus notificaciones/)).toBeInTheDocument();
    } finally {
      online.mockRestore();
    }
  });

  it('keeps what was loaded and warns when the connection drops later', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    try {
      stubApi({ 'POST /auth/refresh': session(), 'GET /me/notifications': page([item(1)], { unread: 1 }) });
      renderPage();
      await screen.findByRole('link', { name: /Título 1/ });
      online.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
      expect(await screen.findByText(/Mostramos lo último que cargamos/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Título 1/ })).toBeInTheDocument();
    } finally {
      online.mockRestore();
    }
  });

  it('loads more pages without duplicating items', async () => {
    const api = stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': (call) =>
        call.query.page === '2'
          ? page([item(1), item(2)], { unread: 2, current: 2, pages: 2 })
          : page([item(2)], { unread: 2, current: 1, pages: 2 }),
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver más' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Notificaciones' })).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.path === '/me/notifications' && c.query.page === '2')).toHaveLength(1);
  });
});
