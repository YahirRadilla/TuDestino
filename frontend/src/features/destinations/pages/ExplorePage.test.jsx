import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readMirror } from '../../../storage/catalogCache.js';
import ExplorePage from './ExplorePage.jsx';

const apiItem = (slug, name, extra = {}) => ({
  id: slug,
  slug,
  name,
  summary: 'Resumen.',
  municipality: 'La Paz',
  is_protected_area: false,
  avg_rating: 4.5,
  reviews_count: 10,
  category: { slug: 'playa', name: 'Playas' },
  location: { lat: 24.1, lng: -110.3 },
  images: [{ url: `/img/${slug}-1.svg`, alt_text: null }],
  ...extra,
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });

const renderPage = (url = '/explorar') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ExplorePage />
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('ExplorePage', () => {
  it('shows a loading state, then the destinations returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: [apiItem('uno', 'Playa Uno')], meta: {} })),
    );
    renderPage();
    expect(screen.getByText('Cargando destinos…')).toBeInTheDocument();
    expect(await screen.findByText('Playa Uno')).toBeInTheDocument();
    expect(screen.queryByText(/mostramos destinos de ejemplo/)).not.toBeInTheDocument();
  });

  it('shows the empty state when the API returns no destinations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: {} })));
    renderPage('/explorar?q=nada');
    expect(await screen.findByText('No encontramos destinos')).toBeInTheDocument();
  });

  it('falls back to bundled sample data with a notice when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderPage();
    expect(await screen.findByText('Balandra')).toBeInTheDocument();
    expect(screen.getByText(/No pudimos contactar al servidor/)).toBeInTheDocument();
  });

  it('shows an error with retry for client errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Mal' } }, 400))
      .mockResolvedValueOnce(jsonResponse({ data: [apiItem('uno', 'Playa Uno')], meta: {} }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    expect(await screen.findByText('No pudimos cargar los destinos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Playa Uno')).toBeInTheDocument();
  });

  it('orders by proximity after the user allows "Cerca de mí"', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 24.14, longitude: -110.31 } }),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: {} }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('near=24.14%2C-110.31'));
    expect(screen.getByRole('button', { name: 'Cerca de mí' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains what to do when the location permission is denied', async () => {
    const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1 }));
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: {} })));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Activa el permiso/);
  });

  describe('offline, from the copy saved on the device', () => {
    const visitOnline = async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            data: [
              apiItem('uno', 'Playa Uno'),
              apiItem('canon', 'Cañón Azul', { location: { lat: 26.8, lng: -113.2 } }),
            ],
            meta: {},
          }),
        ),
      );
      const first = renderPage();
      await screen.findByText('Playa Uno');
      await waitFor(async () => expect((await readMirror('destinations')).items).toHaveLength(2));
      first.unmount();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    };

    it('lists what was seen online (not just the samples) and says when it was synced', async () => {
      await visitOnline();
      renderPage();
      expect(await screen.findByText('Playa Uno')).toBeInTheDocument();
      expect(screen.getByText('Cañón Azul')).toBeInTheDocument();
      expect(screen.queryByText('Balandra')).not.toBeInTheDocument();
      expect(screen.getByText(/Sin conexión|Servidor no disponible/)).toHaveTextContent(
        /mostrando datos guardados.*Última sincronización/,
      );
    });

    it('searches locally ignoring accents', async () => {
      await visitOnline();
      renderPage('/explorar?q=canon');
      expect(await screen.findByText('Cañón Azul')).toBeInTheDocument();
      expect(screen.queryByText('Playa Uno')).not.toBeInTheDocument();
    });

    it('"Cerca de mí" still orders by distance without any connection', async () => {
      await visitOnline();
      const getCurrentPosition = vi.fn((success) =>
        success({ coords: { latitude: 26.8, longitude: -113.2 } }),
      );
      vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
      renderPage();
      await screen.findByText('Playa Uno');
      await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
      await waitFor(() => {
        const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(names).toEqual(['Cañón Azul', 'Playa Uno']);
      });
    });
  });
});
