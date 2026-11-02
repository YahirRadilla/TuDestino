import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider.jsx';
import { readMirror } from '../../../storage/catalogCache.js';
import { apiError, session, stubApi } from '../../../test/apiStub.js';
import EventsPage from './EventsPage.jsx';

const inDays = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const event = (id, title, days, extra = {}) => ({
  id,
  title,
  description: '',
  starts_at: inDays(days),
  ends_at: inDays(days, 12),
  location_name: 'Balandra',
  location: null,
  destination_slug: null,
  image_url: null,
  capacity: null,
  attendees_count: 2,
  ...extra,
});
const body = (...events) => ({ data: events, meta: { total: events.length } });

const renderPage = (url = '/eventos') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <EventsPage />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('EventsPage list', () => {
  it('shows a loading state, then the upcoming events', async () => {
    stubApi({ 'GET /events': body(event('e1', 'Limpieza de playa', 3)) });
    renderPage();
    expect(screen.getByText('Cargando eventos…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Limpieza de playa' })).toBeInTheDocument();
    expect(screen.getByText('2 personas asistirán')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir Limpieza de playa' })).toBeInTheDocument();
  });

  it('offers to propose an event (RF20); signing in is asked by the destination page', async () => {
    stubApi({ 'GET /events': body() });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Proponer un evento' })).toHaveAttribute(
      'href',
      '/eventos/proponer',
    );
  });

  it('has an empty state', async () => {
    stubApi({ 'GET /events': body() });
    renderPage();
    expect(await screen.findByText('No hay eventos próximos')).toBeInTheDocument();
  });

  it('shows an error with retry when the server fails', async () => {
    const api = stubApi({ 'GET /events': apiError(400, 'VALIDATION_ERROR', 'Mal') });
    renderPage();
    expect(await screen.findByText('No pudimos cargar los eventos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(api.count('GET /events')).toBe(2));
  });

  it('anonymous visitors are invited to sign in to attend', async () => {
    stubApi({ 'GET /events': body(event('e1', 'Limpieza', 3)) });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Inicia sesión para asistir' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});

describe('EventsPage attendance', () => {
  const signIn = (extra = {}) => {
    localStorage.setItem('td:session', '1');
    return stubApi({
      'POST /auth/refresh': session(),
      'GET /events': body(event('e1', 'Limpieza', 3, { attending: false })),
      ...extra,
    });
  };

  it('marks "Asistiré" optimistically, updates the count and confirms with the server', async () => {
    const api = signIn({
      'PUT /events/e1/attendance': {
        data: { event_id: 'e1', attending: true },
        meta: { attendees_count: 3 },
      },
    });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Asistiré' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Asistiré' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByText('3 personas asistirán')).toBeInTheDocument();
    expect(api.count('PUT /events/e1/attendance')).toBe(1);
  });

  it('cancels attendance with DELETE', async () => {
    const api = signIn({
      'GET /events': body(event('e1', 'Limpieza', 3, { attending: true, attendees_count: 5 })),
      'DELETE /events/e1/attendance': {
        data: { event_id: 'e1', attending: false },
        meta: { attendees_count: 4 },
      },
    });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Asistiré' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(await screen.findByText('4 personas asistirán')).toBeInTheDocument();
    expect(api.count('DELETE /events/e1/attendance')).toBe(1);
  });

  it('rolls back and explains when the server refuses', async () => {
    signIn({ 'PUT /events/e1/attendance': apiError(500, 'INTERNAL_ERROR', 'Error') });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Asistiré' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo actualizar tu asistencia/);
    expect(screen.getByRole('button', { name: 'Asistiré' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('2 personas asistirán')).toBeInTheDocument();
  });

  it('shows a finished-event state when the server says the event is not open', async () => {
    signIn({ 'PUT /events/e1/attendance': apiError(409, 'EVENT_NOT_OPEN', 'Este evento ya terminó.') });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Asistiré' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este evento ya terminó.');
  });

  it('asks for the personalised list with the access token', async () => {
    const api = signIn();
    renderPage();
    await screen.findByRole('heading', { name: 'Limpieza' });
    expect(api.calls.find((c) => c.path === '/events').authorization).toBe('Bearer access-1');
  });
});

describe('EventsPage calendar view', () => {
  const stubMonth = () => {
    const first = event('e1', 'Limpieza de playa', 3);
    const second = event('e2', 'Jornada de tortugas', 3, { location_name: 'Cabo Pulmo' });
    const later = event('e3', 'Charla', 10);
    stubApi({ 'GET /events': body(first, second, later) });
    return { first, second, later };
  };

  it('is reachable from the view switch and keeps the choice in the URL', async () => {
    stubMonth();
    renderPage();
    await screen.findByRole('heading', { name: 'Limpieza de playa' });
    await userEvent.click(screen.getByRole('button', { name: 'Calendario' }));
    expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'lunes' })).toBeInTheDocument();
  });

  it('marks days with events and lists them when a day is chosen', async () => {
    const { first } = stubMonth();
    renderPage('/eventos?vista=calendario');
    await screen.findByRole('table');
    const day = new Date(first.starts_at);
    const sameMonth = day.getMonth() === new Date().getMonth();
    if (!sameMonth) await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    const button = await screen.findByRole('button', { name: /2 eventos/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    const selection = document.querySelector('.calendar__selection');
    expect(within(selection).getByRole('heading', { name: 'Limpieza de playa' })).toBeInTheDocument();
    expect(within(selection).getByRole('heading', { name: 'Jornada de tortugas' })).toBeInTheDocument();
  });

  it('navigates between months and announces the month', async () => {
    stubMonth();
    renderPage('/eventos?vista=calendario');
    await screen.findByRole('table');
    const title = screen.getByRole('heading', { level: 2 });
    const current = title.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(title.textContent).not.toBe(current);
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(title.textContent).toBe(current);
    expect(title).toHaveAttribute('aria-live', 'polite');
  });
});

describe('EventsPage offline', () => {
  const visitOnline = async () => {
    stubApi({ 'GET /events': body(event('e1', 'Limpieza guardada', 3), event('e2', 'Otra', 4)) });
    const first = renderPage();
    await screen.findByRole('heading', { name: 'Limpieza guardada' });
    await waitFor(async () => expect((await readMirror('events')).items).toHaveLength(2));
    first.unmount();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  };

  it('shows the events saved on the device, read-only, with the sync time', async () => {
    await visitOnline();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Limpieza guardada' })).toBeInTheDocument();
    expect(screen.getByText(/mostrando datos guardados/)).toHaveTextContent(/Última sincronización/);
  });

  it('says what to do when nothing was ever saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderPage();
    expect(await screen.findByText(/No pudimos cargar los eventos|Eventos sin conexión/)).toBeInTheDocument();
  });

  it('does not let a signed-in user toggle attendance without the network', async () => {
    await visitOnline();
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
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Asistiré' });
    expect(buttons[0]).toBeDisabled();
    expect(screen.getAllByText('Necesitas conexión para marcar tu asistencia.')[0]).toBeInTheDocument();
  });
});
