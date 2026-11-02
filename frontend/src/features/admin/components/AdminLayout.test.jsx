import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError } from '../../../test/apiStub.js';
import { page, renderAdmin } from '../../../test/adminTestUtils.jsx';

const summary = {
  data: {
    reports: { pending: 4, in_review: 2, resolved: 7, dismissed: 1 },
    pending_events: 3,
  },
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('admin access by role', () => {
  it('denies plain users with the access-denied screen and never calls the admin API', async () => {
    const { count } = renderAdmin('/admin', { role: 'user', api: { 'GET /admin/summary': summary } });
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
    expect(count('GET /admin/summary')).toBe(0);
    expect(screen.queryByRole('navigation', { name: 'Secciones de administración' })).not.toBeInTheDocument();
  });

  it('sends anonymous visitors to the login screen', async () => {
    const { count } = renderAdmin('/admin', { signedIn: false, api: { 'GET /admin/summary': summary } });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(count('GET /admin/summary')).toBe(0);
  });

  it('shows an authority every section except Usuarios', async () => {
    renderAdmin('/admin', { role: 'authority', api: { 'GET /admin/summary': summary } });
    const nav = await screen.findByRole('navigation', { name: 'Secciones de administración' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Resumen', 'Reportes', 'Mapa', 'Destinos', 'Eventos', 'Educación']);
  });

  it('shows an admin the Usuarios section as well', async () => {
    renderAdmin('/admin', { role: 'admin', api: { 'GET /admin/summary': summary } });
    const nav = await screen.findByRole('navigation', { name: 'Secciones de administración' });
    expect(within(nav).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/admin/usuarios');
  });

  it('blocks an authority who types the Usuarios URL', async () => {
    const { count } = renderAdmin('/admin/usuarios', {
      role: 'authority',
      api: { 'GET /admin/users': page([]), 'GET /admin/areas': { data: [] } },
    });
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
    expect(count('GET /admin/users')).toBe(0);
  });

  it('marks the current section for assistive technology', async () => {
    renderAdmin('/admin/reportes', { api: { 'GET /admin/reports': page([]) } });
    const nav = await screen.findByRole('navigation', { name: 'Secciones de administración' });
    expect(within(nav).getByRole('link', { name: 'Reportes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Resumen' })).not.toHaveAttribute('aria-current');
  });
});

describe('summary', () => {
  it('shows the counters as links to the filtered lists', async () => {
    renderAdmin('/admin', { api: { 'GET /admin/summary': summary } });
    const pending = await screen.findByRole('link', { name: /4\s*Reportes: pendiente/ });
    expect(pending).toHaveAttribute('href', '/admin/reportes?estado=pending');
    expect(screen.getByRole('link', { name: /3\s*Propuestas de eventos por revisar/ })).toHaveAttribute(
      'href',
      '/admin/eventos?estado=pending',
    );
  });

  it('explains a 403 from the server instead of showing a generic error', async () => {
    renderAdmin('/admin', {
      api: { 'GET /admin/summary': () => apiError(403, 'FORBIDDEN', 'No tienes permiso.') },
    });
    expect(await screen.findByText('No tienes permiso para ver esto')).toBeInTheDocument();
  });

  it('offers a retry after a failure', async () => {
    let calls = 0;
    renderAdmin('/admin', {
      api: {
        'GET /admin/summary': () => {
          calls += 1;
          return calls === 1 ? apiError(500, 'INTERNAL_ERROR', 'Error') : summary;
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('link', { name: /Reportes: pendiente/ })).toBeInTheDocument();
  });
});
