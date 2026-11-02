import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Logo from './Logo.jsx';

describe('Logo', () => {
  it('links home and shows the transparent mark beside the wordmark', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'TuDestino, ir al inicio' });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getByText('TuDestino')).toBeInTheDocument();
    const mark = container.querySelector('img.logo__mark');
    expect(mark).toHaveAttribute('src', '/icons/logo-mark.webp');
    expect(mark).toHaveAttribute('alt', '');
  });
});
