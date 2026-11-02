import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAdmin } from '../../../test/adminTestUtils.jsx';
import { apiError } from '../../../test/apiStub.js';

vi.mock('../components/LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

const PINS = {
  data: {
    reports: [
      {
        id: 'r-1',
        folio: 'TD-2026-000001',
        status: 'pending',
        type: { slug: 'tortuga-anidando', name: 'Tortuga anidando', is_sensitive: true },
        created_at: '2026-10-01T00:00:00Z',
        location: { lat: 24.1426, lng: -110.3128 },
        detail_path: '/admin/reportes/r-1',
      },
      {
        id: 'r-2',
        folio: 'TD-2026-000002',
        status: 'resolved',
        type: { slug: 'contaminacion', name: 'Contaminación', is_sensitive: false },
        created_at: '2026-10-02T00:00:00Z',
        location: { lat: 24.2, lng: -110.4 },
        detail_path: '/admin/reportes/r-2',
      },
    ],
  },
  meta: { truncated: { reports: false } },
};

describe('staff map', () => {
  it('shows every report with a pin per status and the EXACT coordinates', async () => {
    const { calls } = renderAdmin('/admin/mapa', { api: { 'GET /admin/map/pins': PINS } });
    const pins = await screen.findAllByTestId('pin');
    expect(pins.map((pin) => pin.dataset.variant)).toEqual(['status-pending', 'status-resolved']);
    expect(pins[0].dataset.position).toBe('24.1426,-110.3128');
    const request = calls.find((call) => call.path === '/admin/map/pins');
    expect(request.authorization).toBe('Bearer access-1');
  });

  it('links each report to its admin detail and lists it with folio, type and status', async () => {
    renderAdmin('/admin/mapa', { api: { 'GET /admin/map/pins': PINS } });
    const list = await screen.findByRole('region', { name: 'Reportes en el mapa' });
    const first = within(list).getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('TD-2026-000001');
    expect(first).toHaveTextContent('Tortuga anidando');
    expect(first).toHaveTextContent('Pendiente');
    expect(within(first).getByRole('link', { name: /Ver reporte: TD-2026-000001/ })).toHaveAttribute(
      'href',
      '/admin/reportes/r-1',
    );
  });

  it('asks the server again when a filter changes', async () => {
    const user = userEvent.setup();
    const { calls } = renderAdmin('/admin/mapa', { api: { 'GET /admin/map/pins': PINS } });
    await screen.findAllByTestId('pin');
    await user.selectOptions(screen.getByLabelText('Estado'), 'resolved');
    await screen.findAllByTestId('pin');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'contaminacion');
    await screen.findAllByTestId('pin');
    const queries = calls.filter((call) => call.path === '/admin/map/pins').map((call) => call.query);
    expect(queries).toContainEqual({ status: 'resolved' });
    expect(queries).toContainEqual({ status: 'resolved', type: 'contaminacion' });
  });

  it('says so when nothing matches', async () => {
    renderAdmin('/admin/mapa', {
      api: { 'GET /admin/map/pins': { data: { reports: [] }, meta: { truncated: { reports: false } } } },
    });
    expect(await screen.findByText('No hay reportes con esos filtros.')).toBeInTheDocument();
  });

  it('explains a failure and offers a retry', async () => {
    renderAdmin('/admin/mapa', {
      api: { 'GET /admin/map/pins': apiError(500, 'INTERNAL', 'Error del servidor.') },
    });
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });

  it('is part of the panel navigation', async () => {
    renderAdmin('/admin/mapa', { api: { 'GET /admin/map/pins': PINS } });
    expect(await screen.findByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/admin/mapa');
  });
});
