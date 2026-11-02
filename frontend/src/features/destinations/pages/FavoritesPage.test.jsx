import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider.jsx';
import FavoritesSync from '../favorites/FavoritesSync.jsx';
import { getFavoritesSnapshot, hydrateFavorites, setLocalFavorite } from '../../../storage/favoritesStore.js';
import { session, stubApi } from '../../../test/apiStub.js';
import FavoritesPage from './FavoritesPage.jsx';

const apiItem = (slug, name) => ({
  id: slug,
  slug,
  name,
  summary: 'Resumen.',
  municipality: 'La Paz',
  avg_rating: 4.5,
  reviews_count: 10,
  category: { slug: 'playa', name: 'Playas' },
  location: { lat: 24.1, lng: -110.3 },
  images: [{ url: `/img/${slug}.svg`, alt_text: null }],
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <FavoritesSync />
        <FavoritesPage />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('FavoritesPage', () => {
  it('shows an empty state when nothing is saved', async () => {
    stubApi({ 'GET /destinations': { data: [apiItem('uno', 'Playa Uno')], meta: {} } });
    renderPage();
    expect(await screen.findByText('Todavía no tienes favoritos aquí')).toBeInTheDocument();
  });

  it('shows the saved destinations from the device (anonymous)', async () => {
    stubApi({
      'GET /destinations': { data: [apiItem('uno', 'Playa Uno'), apiItem('dos', 'Playa Dos')], meta: {} },
    });
    await hydrateFavorites();
    await setLocalFavorite('dos', true);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Playa Dos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Playa Uno' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Playas/ })).toHaveTextContent('1 guardado');
  });

  it('works without a connection using the saved list and catalog copy', async () => {
    await hydrateFavorites();
    await setLocalFavorite('balandra', true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Balandra' })).toBeInTheDocument();
    expect(screen.getByText(/destinos de ejemplo|mostrando datos guardados/)).toBeInTheDocument();
  });

  it('signing in adopts the account favorites from the server', async () => {
    localStorage.setItem('td:session', '1');
    stubApi({
      'POST /auth/refresh': session(),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
      'GET /destinations': { data: [apiItem('uno', 'Playa Uno')], meta: {} },
      'GET /me/favorites': { data: [apiItem('uno', 'Playa Uno')], meta: { total_pages: 1 } },
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Playa Uno' })).toBeInTheDocument();
    expect(getFavoritesSnapshot().ids).toEqual(['uno']);
  });

  it('shows a retry state when the catalog cannot be loaded', async () => {
    stubApi({});
    renderPage();
    await waitFor(() => expect(screen.queryByText('Cargando tus favoritos…')).not.toBeInTheDocument());
    expect(screen.getByText('No pudimos cargar tus favoritos')).toBeInTheDocument();
  });
});
