import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mirrorEvents } from '../../../storage/catalogCache.js';
import { apiError, stubApi } from '../../../test/apiStub.js';
import EventDetailPage from './EventDetailPage.jsx';

const ID = '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10';
const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
const event = {
  id: ID,
  title: 'Limpieza de Balandra',
  description: 'Trae guantes.',
  starts_at: soon,
  ends_at: null,
  location_name: 'Balandra',
  destination_slug: 'balandra',
  image_url: null,
  attendees_count: 7,
};

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={[`/eventos/${ID}`]}>
      <Routes>
        <Route path="eventos/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllGlobals());

describe('EventDetailPage', () => {
  it('shows the event with share, attendance and a link to its destination', async () => {
    stubApi({ [`GET /events/${ID}`]: { data: event, meta: {} } });
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Limpieza de Balandra' })).toBeInTheDocument();
    expect(screen.getByText('Trae guantes.')).toBeInTheDocument();
    expect(screen.getByText('7 personas asistirán')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir Limpieza de Balandra' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el destino' })).toHaveAttribute(
      'href',
      '/destinos/balandra',
    );
  });

  it('shares the event link with the Web Share API (PWA-15)', async () => {
    stubApi({ [`GET /events/${ID}`]: { data: event, meta: {} } });
    const share = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, share });
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Compartir Limpieza de Balandra' }));
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].url).toBe(`${window.location.origin}/eventos/${ID}`);
  });

  it('copies the link when the Web Share API is not available', async () => {
    stubApi({ [`GET /events/${ID}`]: { data: event, meta: {} } });
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Compartir Limpieza de Balandra' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/eventos/${ID}`));
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
  });

  it('says so when the event does not exist', async () => {
    stubApi({ [`GET /events/${ID}`]: apiError(404, 'NOT_FOUND', 'x') });
    renderAt();
    expect(await screen.findByText('No encontramos este evento')).toBeInTheDocument();
  });

  it('opens from the copy saved on the device when offline', async () => {
    await mirrorEvents([event]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Limpieza de Balandra' })).toBeInTheDocument();
    expect(screen.getByText(/mostrando datos guardados/)).toBeInTheDocument();
  });

  it('shows an error when nothing was saved and there is no connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt();
    expect(await screen.findByText('No pudimos cargar este evento')).toBeInTheDocument();
  });
});
