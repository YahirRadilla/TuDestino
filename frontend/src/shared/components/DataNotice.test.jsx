import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataNotice from './DataNotice.jsx';

describe('DataNotice', () => {
  it('renders nothing for live API data', () => {
    const { container } = render(<DataNotice source="api" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says the data was saved on the device and when it was last synced', () => {
    render(<DataNotice source="cache" reason="offline" syncedAt="2026-10-17T20:30:00.000Z" />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('Sin conexión · mostrando datos guardados');
    expect(note).toHaveTextContent(/Última sincronización: .*2026/);
  });

  it('omits the sync time when unknown and adapts the wording to an unreachable server', () => {
    render(<DataNotice source="cache" reason="unreachable" />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('Servidor no disponible · mostrando datos guardados');
    expect(note).not.toHaveTextContent('Última sincronización');
  });

  it('keeps the bundled-samples wording for the seed fallback', () => {
    render(<DataNotice source="fallback" reason="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent(/destinos de ejemplo/);
  });
});

describe('DataNotice on the map', () => {
  it('says only the saved points are shown, and that reports are unavailable offline', () => {
    render(<DataNotice scope="map" source="cache" reason="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sin conexión: mostrando solo los puntos guardados. Los reportes no están disponibles.',
    );
  });

  it('words the bundled fallback for map points', () => {
    render(<DataNotice scope="map" source="fallback" reason="unreachable" />);
    expect(screen.getByRole('status')).toHaveTextContent(/mostrando solo los puntos guardados/);
  });
});
