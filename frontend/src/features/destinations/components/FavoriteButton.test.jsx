import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider.jsx';
import FavoritesSync from '../favorites/FavoritesSync.jsx';
import { apiError, session, stubApi } from '../../../test/apiStub.js';
import FavoriteButton from './FavoriteButton.jsx';

const destination = { id: 'balandra', slug: 'balandra', name: 'Balandra' };
const renderButton = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <FavoritesSync />
        <FavoriteButton destination={destination} />
      </AuthProvider>
    </MemoryRouter>,
  );
const heart = () => screen.getByRole('button', { name: /favoritos/ });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('FavoriteButton', () => {
  it('anonymous visitors save favorites on the device', async () => {
    stubApi({});
    renderButton();
    await userEvent.click(heart());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    expect(heart()).toHaveAccessibleName('Quitar Balandra de favoritos');
  });

  describe('signed in', () => {
    const signIn = (extra = {}) => {
      localStorage.setItem('td:session', '1');
      return stubApi({
        'POST /auth/refresh': session(),
        'GET /me/favorites': { data: [], meta: { total_pages: 1 } },
        ...extra,
      });
    };

    it('flips the heart immediately and confirms with the server', async () => {
      const api = signIn({ 'PUT /me/favorites/balandra': { data: { favorited: true } } });
      renderButton();
      await waitFor(() => expect(api.count('GET /me/favorites')).toBe(1));
      await userEvent.click(heart());
      await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
      expect(api.count('PUT /me/favorites/balandra')).toBe(1);
    });

    it('rolls the heart back and explains when the server refuses', async () => {
      signIn({ 'PUT /me/favorites/balandra': apiError(500, 'INTERNAL_ERROR', 'Error') });
      renderButton();
      await userEvent.click(await screen.findByRole('button', { name: /Guardar Balandra/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo actualizar tu favorito/);
      expect(heart()).toHaveAttribute('aria-pressed', 'false');
    });

    it('says so when it fails for lack of connection', async () => {
      signIn({
        'PUT /me/favorites/balandra': () => {
          throw new TypeError('Failed to fetch');
        },
      });
      renderButton();
      await userEvent.click(await screen.findByRole('button', { name: /Guardar Balandra/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Sin conexión/);
      expect(heart()).toHaveAttribute('aria-pressed', 'false');
    });

    it('merges the favorites saved before signing in without duplicating them', async () => {
      localStorage.setItem('td.favorites', JSON.stringify(['balandra']));
      const api = signIn({
        'GET /me/favorites': {
          data: [
            {
              ...destination,
              category: { slug: 'anp', name: 'ANP' },
              location: { lat: 1, lng: 1 },
              images: [],
            },
          ],
          meta: { total_pages: 1 },
        },
      });
      renderButton();
      await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
      await waitFor(() => expect(api.count('GET /me/favorites')).toBe(1));
      expect(api.count('PUT /me/favorites/balandra')).toBe(0);
    });
  });
});
