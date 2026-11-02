import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { stubApi } from '../../../test/apiStub.js';
import LocationStep from './LocationStep.jsx';

vi.mock('../../map/components/LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

function Host() {
  const [values, setValues] = useState({ lat: '', lng: '', accuracy_m: null, destination_slug: '' });
  return (
    <LocationStep
      values={values}
      errors={{}}
      onChange={(patch) => setValues((cur) => ({ ...cur, ...patch }))}
    />
  );
}

describe('report location step with the map', () => {
  it('tapping the map fills the latitude and longitude fields', async () => {
    stubApi({ 'GET /destinations': { data: [], meta: {} } });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>,
    );
    await user.click(screen.getByText('Ajustar coordenadas a mano'));
    await user.click(screen.getByRole('button', { name: 'tocar mapa' }));
    expect(screen.getByLabelText('Latitud')).toHaveValue('24.12346');
    expect(screen.getByLabelText('Longitud')).toHaveValue('-110.98765');
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '24.12346,-110.98765');
  });

  it('typing coordinates by hand still moves the pin and keeps the GPS button', async () => {
    stubApi({ 'GET /destinations': { data: [], meta: {} } });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Usar mi ubicación' })).toBeInTheDocument();
    await user.click(screen.getByText('Ajustar coordenadas a mano'));
    await user.type(screen.getByLabelText('Latitud'), '24.5');
    await user.type(screen.getByLabelText('Longitud'), '-110.5');
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '24.5,-110.5');
  });
});
