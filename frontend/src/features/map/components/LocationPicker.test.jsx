import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationPicker from './LocationPicker.jsx';

vi.mock('./LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

function Host({ initial = { lat: '', lng: '' }, spy }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <LocationPicker
        value={value}
        onChange={(point) => {
          spy?.(point);
          setValue(point);
        }}
      />
      <output data-testid="value">{`${value.lat},${value.lng}`}</output>
    </>
  );
}

describe('LocationPicker', () => {
  it('starts without a pin when the fields are empty or invalid', () => {
    render(<Host />);
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '');
    render(<Host initial={{ lat: 'abc', lng: '999' }} />);
    expect(screen.getAllByTestId('map')[1]).toHaveAttribute('data-picked', '');
  });

  it('shows the pin at an existing (string) value, centred there', () => {
    render(<Host initial={{ lat: '24.1426', lng: '-110.3128' }} />);
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '24.1426,-110.3128');
    expect(screen.getByTestId('map')).toHaveAttribute('data-center', '24.1426,-110.3128');
  });

  it('reports the tapped point rounded to ~1 m and moves the pin', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Host spy={spy} />);
    await user.click(screen.getByRole('button', { name: 'tocar mapa' }));
    expect(spy).toHaveBeenCalledWith({ lat: 24.12346, lng: -110.98765 });
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '24.12346,-110.98765');
  });

  it('explains that coordinates can be typed instead', () => {
    render(<Host />);
    expect(screen.getByText(/También puedes escribir las coordenadas/)).toBeInTheDocument();
  });
});
