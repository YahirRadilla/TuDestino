import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { stubApi } from '../../../test/apiStub.js';
import MapPage from './MapPage.jsx';

vi.mock('../components/LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

const PINS = {
  data: {
    destinations: [
      {
        slug: 'balandra',
        name: 'Playa Balandra',
        avg_rating: 4.8,
        reviews_count: 12,
        category: { slug: 'playa', name: 'Playa' },
        location: { lat: 24.32, lng: -110.32 },
      },
      {
        slug: 'sierra-laguna',
        name: 'Sierra La Laguna',
        avg_rating: 4.5,
        reviews_count: 3,
        category: { slug: 'anp', name: 'Área protegida' },
        location: { lat: 23.5, lng: -109.9 },
      },
    ],
    reports: [
      {
        id: 'abcd1234abcd1234',
        type: { slug: 'contaminacion', name: 'Contaminación' },
        month: '2026-09',
        location: { lat: 24.14, lng: -110.315 },
        approximate: true,
      },
    ],
  },
  meta: { truncated: { destinations: false, reports: false } },
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/mapa']}>
      <MapPage />
    </MemoryRouter>,
  );

const stubGeolocation = (impl) =>
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: impl } });

beforeEach(() => {
  stubApi({ 'GET /map/pins': PINS });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('map page (HU-T13)', () => {
  it('shows distinct pins for destinations and reports', async () => {
    renderPage();
    const pins = await screen.findAllByTestId('pin');
    expect(pins.map((pin) => pin.dataset.variant).sort()).toEqual([
      'destination',
      'destination',
      'report-contaminacion',
    ]);
  });

  it('offers the same places as a list, with a detail link for destinations only', async () => {
    renderPage();
    const list = await screen.findByRole('region', { name: 'Lugares en el mapa' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByRole('link', { name: /Ver detalle: Playa Balandra/ })).toHaveAttribute(
      'href',
      '/destinos/balandra',
    );
    // The report is approximate: month only, never a link and never a folio.
    const reportItem = within(list).getByText('Contaminación').closest('li');
    expect(reportItem).toHaveTextContent('septiembre de 2026');
    expect(reportItem).toHaveTextContent(/aproximada/);
    expect(within(reportItem).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the list beside an accessible map region without a skip-link button', async () => {
    renderPage();
    await screen.findAllByTestId('pin');
    expect(screen.queryByRole('link', { name: 'Ir a la lista de lugares' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Mapa de destinos y reportes/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lugares en el mapa' })).toBeInTheDocument();
  });

  it('hides a layer with its checkbox', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('pin');
    await user.click(screen.getByRole('checkbox', { name: 'Reportes resueltos' }));
    expect(screen.getAllByTestId('pin')).toHaveLength(2);
    await user.click(screen.getByRole('checkbox', { name: 'Destinos' }));
    expect(screen.queryAllByTestId('pin')).toHaveLength(0);
  });

  it('filters destinations by category and reports by type', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('pin');
    await user.selectOptions(screen.getByLabelText('Categoría de destino'), 'anp');
    expect(screen.getAllByTestId('pin')).toHaveLength(2); // one destination + the report
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'contaminacion');
    expect(screen.getAllByTestId('pin')).toHaveLength(2);
    expect(screen.getByLabelText('Tipo de reporte')).toHaveValue('contaminacion');
  });

  it('selecting a list item sends the selection to the map', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('pin');
    await user.click(screen.getByRole('button', { name: 'Ver Sierra La Laguna en el mapa' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'd:sierra-laguna');
  });

  it('centres on the person and lists the nearest destinations with their distance', async () => {
    const user = userEvent.setup();
    stubGeolocation((success) => success({ coords: { latitude: 24.3, longitude: -110.3 } }));
    renderPage();
    await screen.findAllByTestId('pin');
    await user.click(screen.getByRole('button', { name: 'Mi ubicación' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-user', '24.3,-110.3');
    expect(screen.getByTestId('map')).toHaveAttribute('data-center', '24.3,-110.3');
    const near = screen.getByRole('region', { name: 'Destinos cercanos' });
    const names = within(near)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(names[0]).toMatch(/^Playa Balandra · \d/);
    expect(screen.getAllByText(/de ti$/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Quitar mi ubicación' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-user', '');
  });

  it('explains a denied location permission and keeps the map usable', async () => {
    const user = userEvent.setup();
    stubGeolocation((_success, failure) => failure({ code: 1 }));
    renderPage();
    await screen.findAllByTestId('pin');
    await user.click(screen.getByRole('button', { name: 'Mi ubicación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No diste permiso/);
    expect(screen.getByTestId('map')).toHaveAttribute('data-user', '');
    expect(screen.getAllByTestId('pin')).toHaveLength(3);
  });

  it('reports a device without geolocation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    renderPage();
    await screen.findAllByTestId('pin');
    await user.click(screen.getByRole('button', { name: 'Mi ubicación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no permite obtener la ubicación/);
  });

  it('passes the offline state to the map and shows the saved destinations only', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('pin').length).toBeGreaterThan(0));
    expect(screen.getByTestId('map')).toHaveAttribute('data-offline', 'true');
    for (const pin of screen.getAllByTestId('pin')) expect(pin.dataset.variant).toBe('destination');
    expect(screen.getByText(/mostrando solo los puntos guardados/)).toBeInTheDocument();
    // The list keeps working without a network.
    expect(screen.getByRole('region', { name: 'Lugares en el mapa' })).toBeInTheDocument();
  });

  it('offers a retry when the server fails and nothing is saved', async () => {
    stubApi({}); // every route answers 404: a client error, not an outage
    renderPage();
    expect(await screen.findByText('No pudimos cargar el mapa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});
