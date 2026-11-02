import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './AppLayout.jsx';
import { AuthProvider } from '../../features/auth/AuthProvider.jsx';
import { session, stubApi } from '../../test/apiStub.js';

function mockViewport({ desktop }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: desktop && query.includes('min-width: 768px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderLayout(path = '/explorar') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="explorar" element={<p>Pantalla explorar</p>} />
            <Route path="educacion" element={<p>Pantalla educación</p>} />
            <Route path="reportar" element={<p>Pantalla reportar</p>} />
            <Route path="destinos/:slug" element={<p>Detalle</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    stubApi({ 'POST /auth/refresh': session() });
  });
  afterEach(() => {
    delete window.matchMedia;
    vi.unstubAllGlobals();
  });

  it('mobile: floating bottom nav with the 5 tabs and the active one marked', () => {
    mockViewport({ desktop: false });
    const { container } = renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Explorar', 'Mapa', 'Eventos', 'Aprender', 'Perfil']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/explorar',
      '/mapa',
      '/eventos',
      '/educacion',
      '/perfil',
    ]);
    expect(screen.getByRole('link', { name: /Reportar/ })).toHaveAttribute('href', '/reportar');
    expect(within(nav).getByRole('link', { name: 'Explorar' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('.bottom-nav')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('desktop: top header replaces the bottom nav', () => {
    mockViewport({ desktop: true });
    const { container } = renderLayout();
    const header = screen.getByRole('banner');
    const labels = within(header)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['Explorar', 'Mapa', 'Eventos', 'Aprender', 'Favoritos', 'Reportar']),
    );
    expect(within(header).getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/mapa');
    expect(within(header).getByRole('link', { name: 'Aprender' })).toHaveAttribute('href', '/educacion');
    expect(within(header).getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(within(header).queryByRole('link', { name: /Perfil/ })).not.toBeInTheDocument();
    expect(within(header).getByRole('search')).toBeInTheDocument();
    expect(container.querySelector('.bottom-nav')).not.toBeInTheDocument();
  });

  it('mobile: highlights exactly one tab with aria-current', () => {
    mockViewport({ desktop: false });
    renderLayout('/educacion');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Aprender' })).toHaveAttribute('aria-current', 'page');
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((l) => l.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('mobile: no report FAB on the report screen itself', () => {
    mockViewport({ desktop: false });
    renderLayout('/reportar');
    expect(screen.queryByRole('link', { name: /^Reportar$/ })).not.toBeInTheDocument();
  });

  it('mobile: hides the floating nav on the destination detail', () => {
    mockViewport({ desktop: false });
    const { container } = renderLayout('/destinos/balandra');
    expect(container.querySelector('.bottom-nav')).not.toBeInTheDocument();
    expect(screen.getByText('Detalle')).toBeInTheDocument();
  });

  describe('session-aware account entry', () => {
    const signedIn = () => localStorage.setItem('td:session', '1');

    it('mobile anonymous: the last tab is the profile, which hosts the sign-in calls to action', () => {
      mockViewport({ desktop: false });
      renderLayout();
      const nav = screen.getByRole('navigation', { name: 'Principal' });
      expect(within(nav).getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    });

    it('mobile signed in: the last tab goes to the profile', async () => {
      signedIn();
      mockViewport({ desktop: false });
      renderLayout();
      const nav = screen.getByRole('navigation', { name: 'Principal' });
      expect(await within(nav).findByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    });

    it('desktop signed in: avatar to the profile and the notifications bell', async () => {
      signedIn();
      mockViewport({ desktop: true });
      renderLayout();
      const header = screen.getByRole('banner');
      const profile = await within(header).findByRole('link', {
        name: 'Perfil de Ana Pérez',
      });
      expect(profile).toHaveAttribute('href', '/perfil');
      expect(within(header).getByRole('link', { name: /Notificaciones/ })).toBeInTheDocument();
      expect(within(header).queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    });

    it('desktop anonymous: no bell, just the sign-in button', () => {
      mockViewport({ desktop: true });
      renderLayout();
      const header = screen.getByRole('banner');
      expect(within(header).queryByRole('link', { name: /Notificaciones/ })).not.toBeInTheDocument();
    });
  });
});
