import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import ProfilePage from './ProfilePage.jsx';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { noContent, apiError, session, stubApi, testUser } from '../../../test/apiStub.js';

const routes = [<Route key="profile" path="/perfil" element={<ProfilePage />} />];

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('ProfilePage', () => {
  it('invites anonymous visitors to sign in or register', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/perfil' });
    expect(await screen.findByRole('heading', { name: 'Visitante' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  describe('signed in', () => {
    const signIn = (user = testUser, extra = {}) => {
      localStorage.setItem('td:session', '1');
      return stubApi({ 'POST /auth/refresh': session(user), ...extra });
    };

    it('shows the real account data and role', async () => {
      signIn();
      renderWithAuth(routes, { route: '/perfil' });
      expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument();
      expect(screen.getByText('ana@example.com')).toBeInTheDocument();
      expect(screen.getByText('Usuario')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Panel de administración/ })).not.toBeInTheDocument();
    });

    it('links to "Mis propuestas" (RF20) for any signed-in user', async () => {
      signIn();
      renderWithAuth(routes, { route: '/perfil' });
      expect(await screen.findByRole('link', { name: /Mis propuestas/ })).toHaveAttribute(
        'href',
        '/perfil/propuestas',
      );
    });

    it('links authorities and admins to the panel', async () => {
      signIn({ ...testUser, role: 'authority' });
      renderWithAuth(routes, { route: '/perfil' });
      expect(await screen.findByRole('link', { name: /Panel de administración/ })).toHaveAttribute(
        'href',
        '/admin',
      );
    });

    it('saves name and avatar through PATCH /me', async () => {
      const api = signIn(testUser, {
        'PATCH /me': (call) => ({ data: { ...testUser, ...call.body } }),
        'POST /uploads/images': { data: { url: 'https://res.cloudinary.com/demo/avatar.webp' } },
      });
      renderWithAuth(routes, { route: '/perfil' });
      const name = await screen.findByLabelText('Nombre completo');
      await userEvent.clear(name);
      await userEvent.type(name, 'Ana María');
      await userEvent.upload(
        screen.getByLabelText(/Foto de perfil/),
        new File(['foto'], 'avatar.png', { type: 'image/png' }),
      );
      await screen.findByRole('img', { name: 'Vista previa de la foto de perfil' });
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
      const patch = api.calls.find((call) => call.method === 'PATCH');
      expect(patch.body).toEqual({
        full_name: 'Ana María',
        avatar_url: 'https://res.cloudinary.com/demo/avatar.webp',
      });
      expect(patch.authorization).toBe('Bearer access-1');
      expect(await screen.findByRole('heading', { name: 'Ana María' })).toBeInTheDocument();
    });

    it('shows an upload error and does not save the avatar', async () => {
      const api = signIn(testUser, {
        'POST /uploads/images': apiError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Solo se aceptan fotos JPEG, PNG o WebP válidas.',
        ),
      });
      renderWithAuth(routes, { route: '/perfil' });
      await userEvent.upload(
        await screen.findByLabelText(/Foto de perfil/),
        new File(['foto'], 'avatar.png', { type: 'image/png' }),
      );
      expect(await screen.findByText('Solo se aceptan fotos JPEG, PNG o WebP válidas.')).toBeInTheDocument();
      expect(api.calls.some((call) => call.method === 'PATCH')).toBe(false);
    });

    it('logs out: revokes on the server and returns to the visitor view', async () => {
      const api = signIn(testUser, { 'POST /auth/logout': noContent() });
      renderWithAuth(routes, { route: '/perfil' });
      await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Visitante' })).toBeInTheDocument());
      expect(api.count('POST /auth/logout')).toBe(1);
    });
  });
});
