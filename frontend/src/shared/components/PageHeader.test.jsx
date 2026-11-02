import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<PageHeader title="Título" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PageHeader back arrow', () => {
  it.each(['/favoritos', '/explorar', '/mapa', '/eventos', '/educacion', '/perfil', '/reportar'])(
    'is hidden on the main screen %s',
    (path) => {
      renderAt(path);
      expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument();
    },
  );

  it.each(['/eventos/3', '/seguimiento', '/perfil/eventos'])(
    'is shown on the secondary screen %s',
    (path) => {
      renderAt(path);
      expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    },
  );

  it('falls back to the parent route when there is no in-app history', async () => {
    render(
      <MemoryRouter initialEntries={['/eventos/3']}>
        <Routes>
          <Route path="/eventos" element={<p>Lista de eventos</p>} />
          <Route path="/eventos/:id" element={<PageHeader title="Evento" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Lista de eventos')).toBeInTheDocument();
  });

  it('keeps the main screen arrow-free after switching tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/eventos']}>
        <Link to="/favoritos">ir</Link>
        <Routes>
          <Route path="*" element={<PageHeader title="Título" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'ir' }));
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });
});

describe('PageHeader action layout', () => {
  it('marks headers with an action so the action column sizes to its content', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/eventos']}>
        <PageHeader title="Eventos" action={<a href="/eventos/proponer">Proponer un evento</a>} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toHaveClass('page-header--with-action');
  });

  it('does not add the modifier without an action', () => {
    const { container } = renderAt('/eventos');
    expect(container.firstChild).not.toHaveClass('page-header--with-action');
  });
});
