import { Suspense } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MapView, { TILE_URL } from './MapView.jsx';

// Captures the tile layer's event handlers so a test can play "the tiles failed to load".
const tileLayer = vi.hoisted(() => ({ handlers: null }));
vi.mock('react-leaflet', async (importOriginal) => {
  const actual = await importOriginal();
  const Actual = actual.TileLayer;
  return {
    ...actual,
    TileLayer: (props) => {
      tileLayer.handlers = props.eventHandlers;
      return <Actual {...props} />;
    },
  };
});

// Leaflet itself runs in jsdom (no layout, so the map is 0x0): these tests cover what the
// component hands to Leaflet and what it renders, not the pixels.
const markers = [
  {
    id: 'd:balandra',
    variant: 'destination',
    position: { lat: 24.32, lng: -110.32 },
    title: 'Playa Balandra',
    lines: ['4.8 · 12 reseñas'],
    href: '/destinos/balandra',
    linkLabel: 'Ver detalle',
  },
  {
    id: 'r:1',
    variant: 'report-contaminacion',
    position: { lat: 24.14, lng: -110.315 },
    title: 'Contaminación',
    lines: ['Reporte resuelto · septiembre de 2026', 'Ubicación aproximada (unos 500 m)'],
  },
];

const renderMap = (props) =>
  render(
    <MemoryRouter>
      <MapView
        ariaLabel="Mapa de prueba"
        markers={markers}
        center={{ lat: 24.2, lng: -110.3 }}
        zoom={12}
        {...props}
      />
    </MemoryRouter>,
  );

// jsdom has no layout: give the map a size, otherwise its viewport is empty and no pin is drawn.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
});
afterAll(() => {
  delete HTMLElement.prototype.clientWidth;
  delete HTMLElement.prototype.clientHeight;
});

describe('MapView (Leaflet)', () => {
  it('renders an accessible region with the OpenStreetMap attribution', () => {
    const { container } = renderMap();
    expect(screen.getByRole('region', { name: 'Mapa de prueba' })).toBeInTheDocument();
    const attribution = container.querySelector('.leaflet-control-attribution');
    expect(attribution).toHaveTextContent('© OpenStreetMap contributors');
    expect(attribution.querySelector('a[href="https://www.openstreetmap.org/copyright"]')).not.toBeNull();
  });

  it('uses the standard OSM tile endpoint with CORS so the service worker can cache tiles', () => {
    expect(TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    const { container } = renderMap();
    const tile = container.querySelector('img.leaflet-tile');
    // jsdom does not lay tiles out; when Leaflet created one it must be a CORS request.
    if (tile) expect(tile.crossOrigin).toBe('');
  });

  it('draws its own SVG pins (never Leaflet default images) distinct per kind', () => {
    const { container } = renderMap();
    const pins = [...container.querySelectorAll('.leaflet-marker-icon')];
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(pin.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('img.leaflet-marker-icon')).toHaveLength(0);
    const variants = pins.map((pin) => pin.className);
    expect(variants.some((name) => name.includes('map-pin--destination'))).toBe(true);
    expect(variants.some((name) => name.includes('map-pin--report-contaminacion'))).toBe(true);
  });

  it('keeps pins out of the tab order (the list is the keyboard route)', () => {
    const { container } = renderMap();
    for (const pin of container.querySelectorAll('.leaflet-marker-icon')) {
      expect(pin.getAttribute('tabindex')).not.toBe('0');
    }
  });

  it('localises the zoom controls', () => {
    const { container } = renderMap();
    expect(container.querySelector('a.leaflet-control-zoom-in')).toHaveAttribute('title', 'Acercar');
    expect(container.querySelector('a.leaflet-control-zoom-out')).toHaveAttribute('title', 'Alejar');
  });

  it('opens the popup of an externally selected pin, with a link to its detail', async () => {
    const { container } = renderMap({ selectedId: 'd:balandra', selectRequest: 1 });
    const popup = await vi.waitFor(() => {
      const found = container.querySelector('.leaflet-popup');
      if (!found) throw new Error('popup not open yet');
      return found;
    });
    expect(popup).toHaveTextContent('Playa Balandra');
    expect(popup.querySelector('a.map-popup__link')).toHaveAttribute('href', '/destinos/balandra');
    expect(popup.querySelector('.leaflet-popup-close-button')).toHaveAttribute('aria-label', 'Cerrar');
  });

  it('a report popup shows type and month and offers no link', async () => {
    const { container } = renderMap({ selectedId: 'r:1', selectRequest: 1 });
    const popup = await vi.waitFor(() => {
      const found = container.querySelector('.leaflet-popup');
      if (!found) throw new Error('popup not open yet');
      return found;
    });
    expect(popup).toHaveTextContent('Contaminación');
    expect(popup).toHaveTextContent('septiembre de 2026');
    expect(popup).toHaveTextContent('aproximada');
    expect(popup.querySelector('a.map-popup__link')).toBeNull();
  });

  it('shows the user position and the picked point with their own pins', () => {
    const { container } = renderMap({
      userPosition: { lat: 24.1, lng: -110.3 },
      picked: { lat: 24.2, lng: -110.4 },
    });
    expect(container.querySelector('.map-pin--user')).not.toBeNull();
    expect(container.querySelector('.map-pin--picker')).not.toBeNull();
  });

  it('shows the no-tiles note only when offline AND the tiles failed', async () => {
    const NOTE = /Sin conexión: mostrando solo los puntos guardados/;
    const { container, rerender } = renderMap({ offline: true });
    expect(screen.queryByText(NOTE)).toBeNull();

    act(() => tileLayer.handlers.tileerror());
    expect(screen.getByRole('status')).toHaveTextContent(NOTE);
    expect(container.querySelector('.map-view--no-tiles')).not.toBeNull();

    // A tile that does load (served from the cache) clears it.
    act(() => tileLayer.handlers.tileload());
    expect(screen.queryByText(NOTE)).toBeNull();

    // Online, a failing tile is just a failing tile: no offline message.
    rerender(
      <MemoryRouter>
        <MapView ariaLabel="Mapa de prueba" markers={markers} offline={false} />
      </MemoryRouter>,
    );
    act(() => tileLayer.handlers.tileerror());
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe('MapView inside Suspense', () => {
  it('survives its tree being hidden and revealed again (no second map on the same element)', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let blocked = false;
    function Gate() {
      if (blocked) throw gate;
      return null;
    }
    const view = (
      <MemoryRouter>
        <Suspense fallback={<p>cargando</p>}>
          <MapView ariaLabel="Mapa de prueba" markers={markers} />
          <Gate />
        </Suspense>
      </MemoryRouter>
    );
    const { container, rerender } = render(view);
    expect(container.querySelector('.leaflet-container')).not.toBeNull();

    blocked = true; // a sibling suspends: React hides the map without unmounting it
    rerender(
      <MemoryRouter>
        <Suspense fallback={<p>cargando</p>}>
          <MapView ariaLabel="Mapa de prueba" markers={markers} />
          <Gate />
        </Suspense>
      </MemoryRouter>,
    );
    blocked = false;
    release();
    await act(async () => {
      await gate;
    });
    rerender(view);
    expect(container.querySelectorAll('.leaflet-container')).toHaveLength(1);
    expect(screen.queryByText('cargando')).toBeNull();
  });
});
