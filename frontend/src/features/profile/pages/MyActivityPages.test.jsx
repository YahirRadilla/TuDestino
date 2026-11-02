import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { apiError, session, stubApi } from '../../../test/apiStub.js';
import { RequireAuth } from '../../auth/components/RouteGuards.jsx';
import MyEventsPage from '../../events/pages/MyEventsPage.jsx';
import MyReviewsPage from './MyReviewsPage.jsx';
import ProfilePage from './ProfilePage.jsx';

const guarded = (path, element) => (
  <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
);
const routes = [
  guarded('/perfil/eventos', <MyEventsPage />),
  guarded('/perfil/resenas', <MyReviewsPage />),
  <Route key="login" path="/login" element={<p>pantalla de login</p>} />,
  <Route key="profile" path="/perfil" element={<ProfilePage />} />,
];
const signIn = (extra = {}) => {
  localStorage.setItem('td:session', '1');
  return stubApi({ 'POST /auth/refresh': session(), ...extra });
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const future = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('Mis eventos', () => {
  it('asks anonymous visitors to sign in first', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/perfil/eventos' });
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  });

  it('lists the events the user will attend and can switch to past ones', async () => {
    const api = signIn({
      'GET /me/events': (call) => ({
        data: [
          {
            id: 'e1',
            title: 'Limpieza de Balandra',
            description: '',
            starts_at: future(3),
            ends_at: null,
            location_name: 'Balandra',
            attendees_count: 4,
            attending: true,
          },
        ],
        meta: { total: 1 },
        scope: call.path,
      }),
    });
    renderWithAuth(routes, { route: '/perfil/eventos' });
    expect(await screen.findByRole('heading', { name: 'Limpieza de Balandra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asistiré' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Pasados' }));
    await waitFor(() => {
      const urls = api.fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes('/me/events') && url.includes('scope=past'))).toBe(true);
    });
  });

  it('has an empty state with a way to find events', async () => {
    signIn({ 'GET /me/events': { data: [], meta: { total: 0 } } });
    renderWithAuth(routes, { route: '/perfil/eventos' });
    expect(await screen.findByText('Aún no vas a ningún evento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver eventos' })).toHaveAttribute('href', '/eventos');
  });

  it('says it needs a connection when offline', async () => {
    localStorage.setItem('td:session', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/auth/refresh')) {
          return new Response(JSON.stringify(session()), { status: 200 });
        }
        throw new TypeError('Failed to fetch');
      }),
    );
    renderWithAuth(routes, { route: '/perfil/eventos' });
    expect(await screen.findByText('No pudimos cargar tus eventos')).toBeInTheDocument();
  });
});

describe('Mis reseñas', () => {
  it('lists my reviews with a link to each destination', async () => {
    signIn({
      'GET /me/reviews': {
        data: [
          {
            id: 'r1',
            rating: 5,
            comment: 'Preciosa',
            created_at: '2026-10-01T10:00:00Z',
            updated_at: '2026-10-01T10:00:00Z',
            destination: { slug: 'balandra', name: 'Balandra' },
          },
        ],
        meta: { total: 1 },
      },
    });
    renderWithAuth(routes, { route: '/perfil/resenas' });
    expect(await screen.findByText('Preciosa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Balandra' })).toHaveAttribute('href', '/destinos/balandra');
    expect(screen.getByRole('img', { name: '5 de 5 estrellas' })).toBeInTheDocument();
  });

  it('has an empty state and an error state', async () => {
    signIn({ 'GET /me/reviews': { data: [], meta: { total: 0 } } });
    const first = renderWithAuth(routes, { route: '/perfil/resenas' });
    expect(await screen.findByText('Aún no has escrito reseñas')).toBeInTheDocument();
    first.unmount();

    signIn({ 'GET /me/reviews': apiError(500, 'INTERNAL_ERROR', 'Error') });
    renderWithAuth(routes, { route: '/perfil/resenas' });
    expect(await screen.findByText('No pudimos cargar tus reseñas')).toBeInTheDocument();
  });
});

describe('Profile entries', () => {
  it('links to my events and my reviews when signed in', async () => {
    signIn();
    renderWithAuth(routes, { route: '/perfil' });
    expect(await screen.findByRole('link', { name: /Mis eventos/ })).toHaveAttribute(
      'href',
      '/perfil/eventos',
    );
    expect(screen.getByRole('link', { name: /Mis reseñas/ })).toHaveAttribute('href', '/perfil/resenas');
  });
});
