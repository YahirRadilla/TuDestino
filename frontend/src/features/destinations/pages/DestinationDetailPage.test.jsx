import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mirrorDestinations } from '../../../storage/catalogCache.js';
import { apiError, stubApi } from '../../../test/apiStub.js';
import DestinationDetailPage from './DestinationDetailPage.jsx';

const detail = {
  id: 'x',
  slug: 'balandra',
  name: 'Balandra API',
  summary: 'Resumen.',
  description: 'Descripción desde la API.',
  municipality: 'La Paz',
  is_protected_area: true,
  avg_rating: 4.9,
  reviews_count: 342,
  category: { slug: 'anp', name: 'Áreas protegidas' },
  location: { lat: 24.3, lng: -110.3 },
  images: [{ url: '/img/balandra-1.svg', alt_text: null }],
  highlights: [],
  care_tips: [],
};
const noReviews = { data: [], meta: { total: 0 } };

const renderAt = (slug) =>
  render(
    <MemoryRouter initialEntries={[`/destinos/${slug}`]}>
      <Routes>
        <Route path="destinos/:slug" element={<DestinationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('DestinationDetailPage', () => {
  it('shows the detail returned by the API and hides empty sections', async () => {
    stubApi({
      'GET /destinations/balandra': { data: detail, meta: {} },
      'GET /destinations/balandra/reviews': noReviews,
    });
    renderAt('balandra');
    expect(await screen.findByRole('heading', { name: 'Balandra API' })).toBeInTheDocument();
    expect(screen.queryByText('Visita responsable')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reseñas' })).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay reseñas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Compartir/ })).not.toBeInTheDocument();
  });

  it('does not show a rating until the destination has real reviews', async () => {
    stubApi({
      'GET /destinations/balandra': { data: { ...detail, avg_rating: 0, reviews_count: 0 }, meta: {} },
      'GET /destinations/balandra/reviews': noReviews,
    });
    renderAt('balandra');
    expect(await screen.findByRole('heading', { name: 'Balandra API' })).toBeInTheDocument();
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.queryByText(/0 reseñas/)).not.toBeInTheDocument();
  });

  it('shows "not found" when the API answers 404', async () => {
    stubApi({
      'GET /destinations/no-existe': apiError(404, 'NOT_FOUND', 'x'),
      'GET /destinations/no-existe/reviews': apiError(404, 'NOT_FOUND', 'x'),
    });
    renderAt('no-existe');
    expect(await screen.findByText('No encontramos este destino')).toBeInTheDocument();
  });

  it('falls back to the bundled destination with a notice when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt('balandra');
    expect(await screen.findByRole('heading', { name: 'Balandra' })).toBeInTheDocument();
    expect(screen.getByText(/No pudimos contactar al servidor/)).toBeInTheDocument();
    expect(screen.queryByText('4.9')).not.toBeInTheDocument();
    expect(screen.queryByText(/342 reseñas/)).not.toBeInTheDocument();
  });

  it('works offline from the copy saved on the device, with the sync time', async () => {
    await mirrorDestinations([{ ...detail, name: 'Balandra guardada' }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt('balandra');
    expect(await screen.findByRole('heading', { name: 'Balandra guardada' })).toBeInTheDocument();
    expect(screen.getByText(/mostrando datos guardados/)).toHaveTextContent(/Última sincronización/);
    // Reviews need the network: that part says so instead of showing made-up ones.
    expect(await screen.findByText(/Reseñas sin conexión|No pudimos cargar las reseñas/)).toBeInTheDocument();
  });

  it('keeps a destination viewed online available offline afterwards', async () => {
    stubApi({
      'GET /destinations/balandra': { data: detail, meta: {} },
      'GET /destinations/balandra/reviews': noReviews,
    });
    const first = renderAt('balandra');
    await screen.findByRole('heading', { name: 'Balandra API' });
    await waitFor(async () => {
      const { readMirror } = await import('../../../storage/catalogCache.js');
      expect((await readMirror('destinations')).items).toHaveLength(1);
    });
    first.unmount();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt('balandra');
    expect(await screen.findByRole('heading', { name: 'Balandra API' })).toBeInTheDocument();
    expect(screen.getByText(/mostrando datos guardados/)).toBeInTheDocument();
  });

  it('shows an error with retry on a client error', async () => {
    stubApi({
      'GET /destinations/balandra': apiError(400, 'VALIDATION_ERROR', 'Mal'),
      'GET /destinations/balandra/reviews': noReviews,
    });
    renderAt('balandra');
    expect(await screen.findByText('No pudimos cargar este destino')).toBeInTheDocument();
  });
});
