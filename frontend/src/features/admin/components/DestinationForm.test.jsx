import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DestinationForm from './DestinationForm.jsx';

vi.mock('../../map/components/LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

const renderForm = () =>
  render(
    <DestinationForm
      categories={[{ slug: 'playa', name: 'Playas' }]}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

describe('destination form map picker', () => {
  it('fills the numeric latitude and longitude when the map is tapped', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'tocar mapa' }));
    expect(screen.getByLabelText('Latitud')).toHaveValue('24.12346');
    expect(screen.getByLabelText('Longitud')).toHaveValue('-110.98765');
  });

  it('keeps the accessible numeric inputs and moves the pin when they change', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '');
    await user.type(screen.getByLabelText('Latitud'), '24.1');
    await user.type(screen.getByLabelText('Longitud'), '-110.3');
    expect(screen.getByTestId('map')).toHaveAttribute('data-picked', '24.1,-110.3');
  });
});
