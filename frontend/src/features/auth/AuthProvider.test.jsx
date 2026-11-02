import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthProvider.jsx';
import { useAuth } from './authContext.js';
import { apiFetch } from '../../api/client.js';
import { apiError, noContent, session, stubApi, testUser } from '../../test/apiStub.js';

function Probe() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="name">{user?.full_name ?? '-'}</p>
      <button onClick={() => login({ email: 'ana@example.com', password: 'Segura#2026' })}>entrar</button>
      <button onClick={logout}>salir</button>
    </div>
  );
}

const renderProvider = (ui = <Probe />, { strict = false } = {}) => {
  const tree = <AuthProvider>{ui}</AuthProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider: session restore', () => {
  it('starts anonymous without any request when there is no session hint', async () => {
    const api = stubApi({});
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('silently refreshes at load and exposes the user', async () => {
    localStorage.setItem('td:session', '1');
    const api = stubApi({ 'POST /auth/refresh': session() });
    renderProvider();
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('name')).toHaveTextContent('Ana Pérez');
    expect(api.calls[0]).toMatchObject({ method: 'POST', path: '/auth/refresh', credentials: 'include' });
  });

  it('becomes anonymous and forgets the hint when the refresh token is rejected', async () => {
    localStorage.setItem('td:session', '1');
    stubApi({ 'POST /auth/refresh': () => apiError(401, 'INVALID_SESSION', 'Expiró') });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(localStorage.getItem('td:session')).toBeNull();
  });

  it('keeps the hint when the server is unreachable', async () => {
    localStorage.setItem('td:session', '1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(localStorage.getItem('td:session')).toBe('1');
  });

  it('refreshes only once under StrictMode double effects', async () => {
    localStorage.setItem('td:session', '1');
    const api = stubApi({ 'POST /auth/refresh': session() });
    renderProvider(<Probe />, { strict: true });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(api.count('POST /auth/refresh')).toBe(1);
  });
});

describe('AuthProvider: access token handling', () => {
  it('keeps the access token in memory only, never in web storage', async () => {
    stubApi({ 'POST /auth/login': session(testUser, 'secret-access-token') });
    renderProvider();
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    const stored = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(stored).not.toContain('secret-access-token');
  });

  it('shares ONE refresh between concurrent 401s and retries each request once', async () => {
    localStorage.setItem('td:session', '1');
    let refreshes = 0;
    let validToken = null;
    const api = stubApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        validToken = 'token-' + refreshes;
        return session(testUser, validToken);
      },
      'GET /me': (call) =>
        call.authorization === 'Bearer ' + validToken
          ? { data: testUser }
          : apiError(401, 'UNAUTHORIZED', 'Debes iniciar sesión.'),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(api.count('POST /auth/refresh')).toBe(1);

    validToken = 'invalidated-elsewhere'; // the access token held in memory is now stale
    api.calls.length = 0;
    const results = await Promise.all([
      apiFetch('/me', { auth: true }),
      apiFetch('/me', { auth: true }),
      apiFetch('/me', { auth: true }),
    ]);
    expect(results).toHaveLength(3);
    expect(api.count('POST /auth/refresh')).toBe(1);
    expect(api.count('GET /me')).toBe(6); // 3 rejected + 3 retried, never more
  });

  it('ends the session when a 401 cannot be renewed', async () => {
    stubApi({
      'POST /auth/login': session(),
      'POST /auth/refresh': () => apiError(401, 'INVALID_SESSION', 'Expiró'),
      'GET /me': () => apiError(401, 'UNAUTHORIZED', 'No'),
    });
    renderProvider();
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    await act(async () => {
      await expect(apiFetch('/me', { auth: true })).rejects.toMatchObject({ status: 401 });
    });
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });
});

describe('AuthProvider: logout', () => {
  it('revokes on the server, clears the user and the hint', async () => {
    const api = stubApi({ 'POST /auth/login': session(), 'POST /auth/logout': noContent() });
    renderProvider();
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(localStorage.getItem('td:session')).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: 'salir' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('name')).toHaveTextContent('-');
    expect(localStorage.getItem('td:session')).toBeNull();
    expect(api.count('POST /auth/logout')).toBe(1);
  });

  it('still signs out locally when the server cannot be reached', async () => {
    const routes = { 'POST /auth/login': session() };
    const api = stubApi(routes);
    renderProvider();
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    api.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await userEvent.click(screen.getByRole('button', { name: 'salir' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  });
});
