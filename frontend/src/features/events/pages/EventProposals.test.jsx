import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { RequireAuth } from '../../auth/components/RouteGuards.jsx';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { apiError, json, session, stubApi, testUser } from '../../../test/apiStub.js';
import MyProposalsPage from './MyProposalsPage.jsx';
import ProposeEventPage from './ProposeEventPage.jsx';

const routes = [
  <Route key="login" path="/login" element={<p>Pantalla de login</p>} />,
  <Route
    key="propose"
    path="/eventos/proponer"
    element={
      <RequireAuth>
        <ProposeEventPage />
      </RequireAuth>
    }
  />,
  <Route
    key="mine"
    path="/perfil/propuestas"
    element={
      <RequireAuth>
        <MyProposalsPage />
      </RequireAuth>
    }
  />,
];

const signedIn = (api = {}) => {
  localStorage.setItem('td:session', '1');
  return stubApi({ 'POST /auth/refresh': session({ ...testUser, role: 'user' }), ...api });
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const fill = async (title = 'Limpieza de Balandra', startsAt = '2099-05-01T09:00') => {
  await userEvent.type(await screen.findByLabelText('Título'), title);
  await userEvent.type(screen.getByLabelText('Empieza'), startsAt);
};

describe('propose an event (RF20)', () => {
  it('asks anonymous visitors to sign in first', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/eventos/proponer' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
  });

  it('refuses a past date without calling the API', async () => {
    const stub = signedIn({ 'POST /events': () => json({ data: {} }, 201) });
    renderWithAuth(routes, { route: '/eventos/proponer' });
    await fill('Limpieza pasada', '2020-01-01T09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar propuesta' }));
    expect(await screen.findByText('No se permiten fechas pasadas.')).toBeInTheDocument();
    expect(stub.count('POST /events')).toBe(0);
  });

  it('requires a title', async () => {
    const stub = signedIn();
    renderWithAuth(routes, { route: '/eventos/proponer' });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar propuesta' }));
    expect(await screen.findByText('El título debe tener entre 3 y 120 caracteres.')).toBeInTheDocument();
    expect(stub.count('POST /events')).toBe(0);
  });

  it('sends the proposal with the session and confirms it is pending review', async () => {
    const stub = signedIn({
      'POST /events': () =>
        json(
          {
            data: {
              id: 'e-9',
              title: 'Limpieza de Balandra',
              status: 'pending',
              starts_at: '2099-05-01T15:00:00.000Z',
            },
          },
          201,
        ),
    });
    renderWithAuth(routes, { route: '/eventos/proponer' });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar propuesta' }));
    expect(await screen.findByText('¡Gracias! Recibimos tu propuesta')).toBeInTheDocument();
    expect(screen.getByText(/queda pendiente de revisión/)).toBeInTheDocument();
    const call = stub.calls.find((c) => c.method === 'POST' && c.path === '/events');
    expect(call.authorization).toMatch(/^Bearer /);
    expect(call.body).toMatchObject({
      title: 'Limpieza de Balandra',
      starts_at: new Date('2099-05-01T09:00').toISOString(),
    });
    expect(screen.getByRole('link', { name: 'Ver mis propuestas' })).toHaveAttribute(
      'href',
      '/perfil/propuestas',
    );
  });

  it('lets the person propose another one with a clean form', async () => {
    signedIn({
      'POST /events': () =>
        json({ data: { id: 'e-9', title: 'Limpieza de Balandra', status: 'pending' } }, 201),
    });
    renderWithAuth(routes, { route: '/eventos/proponer' });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar propuesta' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Proponer otro' }));
    expect(await screen.findByLabelText('Título')).toHaveValue('');
  });

  it('shows the server error and keeps what was typed', async () => {
    signedIn({ 'POST /events': () => apiError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.') });
    renderWithAuth(routes, { route: '/eventos/proponer' });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar propuesta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes');
    expect(screen.getByLabelText('Título')).toHaveValue('Limpieza de Balandra');
  });
});

describe('my proposals', () => {
  const proposals = [
    {
      id: 'e-1',
      title: 'Limpieza de Balandra',
      status: 'pending',
      starts_at: '2099-05-01T15:00:00.000Z',
      location_name: 'Balandra',
      moderation_note: null,
    },
    {
      id: 'e-2',
      title: 'Jornada de manglar',
      status: 'published',
      starts_at: '2099-06-01T15:00:00.000Z',
      location_name: null,
      moderation_note: null,
    },
    {
      id: 'e-3',
      title: 'Fiesta en la playa',
      status: 'rejected',
      starts_at: '2099-07-01T15:00:00.000Z',
      location_name: null,
      moderation_note: 'No se permiten fiestas en la zona de anidación.',
    },
  ];

  it('shows each proposal with its status and the rejection reason', async () => {
    signedIn({ 'GET /me/events/proposed': { data: proposals } });
    renderWithAuth(routes, { route: '/perfil/propuestas' });
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Pendiente de revisión')).toBeInTheDocument();
    expect(within(items[1]).getByText('Publicado')).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Ver el evento' })).toHaveAttribute(
      'href',
      '/eventos/e-2',
    );
    expect(within(items[2]).getByText('Rechazado')).toBeInTheDocument();
    expect(within(items[2]).getByText(/No se permiten fiestas/)).toBeInTheDocument();
  });

  it('invites the person to propose when there are none', async () => {
    signedIn({ 'GET /me/events/proposed': { data: [] } });
    renderWithAuth(routes, { route: '/perfil/propuestas' });
    expect(await screen.findByText('Aún no has propuesto eventos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Proponer un evento' })).toHaveAttribute(
      'href',
      '/eventos/proponer',
    );
  });

  it('explains a lost connection with a retry', async () => {
    signedIn({ 'GET /me/events/proposed': () => apiError(500, 'INTERNAL_ERROR', 'Error') });
    renderWithAuth(routes, { route: '/perfil/propuestas' });
    expect(await screen.findByText('No pudimos cargar tus propuestas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});
