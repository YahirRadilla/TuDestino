import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstallButton from './InstallButton.jsx';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('InstallButton', () => {
  it('shows the manual instructions on iOS, where there is no native install prompt', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    );
    const user = userEvent.setup();
    render(<InstallButton variant="profile" />);

    await user.click(screen.getByRole('button', { name: 'Instalar app' }));

    const dialog = screen.getByRole('dialog', { name: 'Instalar TuDestino' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument();
  });
});
