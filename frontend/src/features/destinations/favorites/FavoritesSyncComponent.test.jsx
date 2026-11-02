import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../../auth/AuthProvider.jsx';
import { useAuth } from '../../auth/authContext.js';
import { STORES, getAll } from '../../../storage/db.js';
import { getFavoritesSnapshot } from '../../../storage/favoritesStore.js';
import { noContent, session, stubApi } from '../../../test/apiStub.js';
import FavoritesSync from './FavoritesSync.jsx';

const dest = (slug) => ({
  id: slug,
  slug,
  name: slug,
  summary: '',
  category: { slug: 'playa', name: 'Playas' },
  location: { lat: 1, lng: 2 },
  images: [],
});

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={logout}>salir</button>;
}

const renderSync = () =>
  render(
    <AuthProvider>
      <FavoritesSync />
      <LogoutButton />
    </AuthProvider>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('FavoritesSync', () => {
  it('syncs once after sign-in and again when the connection returns', async () => {
    localStorage.setItem('td:session', '1');
    let attempts = 0;
    const api = stubApi({
      'POST /auth/refresh': session(),
      'GET /me/favorites': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return { data: [dest('balandra')], meta: { total_pages: 1 } };
      },
    });
    renderSync();
    await waitFor(() => expect(api.count('GET /me/favorites')).toBe(1));
    expect(getFavoritesSnapshot().ids).toEqual([]);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(getFavoritesSnapshot().ids).toEqual(['balandra']));
  });

  it('forgets the account favorites on sign-out so the next person starts clean', async () => {
    localStorage.setItem('td:session', '1');
    stubApi({
      'POST /auth/refresh': session(),
      'POST /auth/logout': noContent(),
      'GET /me/favorites': { data: [dest('balandra')], meta: { total_pages: 1 } },
    });
    renderSync();
    await waitFor(() => expect(getFavoritesSnapshot().ids).toEqual(['balandra']));
    await userEvent.click(screen.getByRole('button', { name: 'salir' }));
    await waitFor(() => expect(getFavoritesSnapshot().ids).toEqual([]));
    expect(await getAll(STORES.favorites)).toEqual([]);
  });

  it('does not touch the device favorites of an anonymous visitor', async () => {
    const api = stubApi({});
    renderSync();
    await waitFor(() => expect(getFavoritesSnapshot().ready).toBe(true));
    expect(api.fetchMock).not.toHaveBeenCalled();
  });
});
