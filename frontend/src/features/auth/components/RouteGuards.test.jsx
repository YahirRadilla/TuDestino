import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { RequireAuth, RequireRole } from './RouteGuards.jsx';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { apiError, session, stubApi, testUser } from '../../../test/apiStub.js';

const routes = [
  <Route key="login" path="/login" element={<p>Pantalla de login</p>} />,
  <Route
    key="private"
    path="/privado"
    element={
      <RequireAuth>
        <p>Contenido privado</p>
      </RequireAuth>
    }
  />,
  <Route
    key="admin"
    path="/admin"
    element={
      <RequireRole roles={['authority', 'admin']}>
        <p>Panel</p>
      </RequireRole>
    }
  />,
];

const signedIn = (role) => {
  localStorage.setItem('td:session', '1');
  stubApi({ 'POST /auth/refresh': session({ ...testUser, role }) });
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('RequireAuth', () => {
  it('redirects anonymous visitors to /login', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/privado' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(screen.queryByText('Contenido privado')).not.toBeInTheDocument();
  });

  it('shows a status while the session is being restored, then the content', async () => {
    signedIn('user');
    renderWithAuth(routes, { route: '/privado' });
    expect(screen.getByRole('status')).toHaveTextContent('Verificando tu sesión');
    expect(await screen.findByText('Contenido privado')).toBeInTheDocument();
  });

  it('sends the visitor to /login when the session was revoked', async () => {
    localStorage.setItem('td:session', '1');
    stubApi({ 'POST /auth/refresh': () => apiError(401, 'INVALID_SESSION', 'Expiró') });
    renderWithAuth(routes, { route: '/privado' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('denies plain users with an access-denied screen', async () => {
    signedIn('user');
    renderWithAuth(routes, { route: '/admin' });
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
  });

  it.each(['authority', 'admin'])('lets %s through', async (role) => {
    signedIn(role);
    renderWithAuth(routes, { route: '/admin' });
    expect(await screen.findByText('Panel')).toBeInTheDocument();
  });

  it('sends anonymous visitors to login instead of showing the denial', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/admin' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
  });
});
