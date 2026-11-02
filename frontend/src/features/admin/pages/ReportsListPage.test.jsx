import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError } from '../../../test/apiStub.js';
import { page, renderAdmin, stubDesktop } from '../../../test/adminTestUtils.jsx';
import { reportItem } from '../../../test/adminFixtures.js';

const items = [
  reportItem(),
  reportItem({
    id: 'r-2',
    folio: 'TD-2026-000002',
    status: 'in_review',
    type: { slug: 'animal-varado', name: 'Animal varado' },
    anonymous: false,
    evidences_count: 1,
  }),
];

let restore = () => {};
beforeEach(() => localStorage.clear());
afterEach(() => {
  restore();
  restore = () => {};
  vi.unstubAllGlobals();
});

describe('reports list (desktop table)', () => {
  beforeEach(() => {
    restore = stubDesktop(true);
  });

  it('renders a real table with one row per report and links to the detail', async () => {
    renderAdmin('/admin/reportes', { api: { 'GET /admin/reports': page(items) } });
    const table = await screen.findByRole('table', { name: 'Reportes ciudadanos' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2
    const link = within(table).getByRole('link', { name: 'TD-2026-000002' });
    expect(link).toHaveAttribute('href', '/admin/reportes/r-2');
    expect(within(rows[1]).getByText('Pendiente')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Anónimo')).toBeInTheDocument();
    expect(within(rows[2]).getByText('En revisión')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Con cuenta')).toBeInTheDocument();
  });

  it('reads the filters from the URL and sends them to the API', async () => {
    const { calls } = renderAdmin('/admin/reportes?estado=pending&tipo=contaminacion&pagina=2', {
      api: { 'GET /admin/reports': page(items, { page: 2, total: 12, total_pages: 2 }) },
    });
    await screen.findByRole('table');
    const call = calls.find((c) => c.path === '/admin/reports');
    expect(call.query).toMatchObject({ status: 'pending', type: 'contaminacion', page: '2', limit: '10' });
    expect(screen.getByLabelText('Estado')).toHaveValue('pending');
    expect(screen.getByLabelText('Tipo')).toHaveValue('contaminacion');
    expect(call.authorization).toMatch(/^Bearer /);
  });

  it('filters by status when the select changes, and resets to the first page', async () => {
    const { calls } = renderAdmin('/admin/reportes?pagina=3', {
      api: { 'GET /admin/reports': page(items) },
    });
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'resolved');
    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/admin/reports').at(-1);
      expect(last.query.status).toBe('resolved');
      expect(last.query.page).toBe('1');
    });
  });

  it('searches by folio in upper case', async () => {
    const { calls } = renderAdmin('/admin/reportes', { api: { 'GET /admin/reports': page(items) } });
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Buscar por folio'), 'td-2026-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/admin/reports').at(-1).query.folio).toBe('TD-2026-0001');
    });
  });

  it('rejects folio searches with odd characters without calling the API', async () => {
    const { calls } = renderAdmin('/admin/reportes', { api: { 'GET /admin/reports': page(items) } });
    await screen.findByRole('table');
    const before = calls.length;
    await userEvent.type(screen.getByLabelText('Buscar por folio'), '%_');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(/solo letras, números y guiones/)).toBeInTheDocument();
    expect(calls).toHaveLength(before);
  });

  it('paginates with previous / next', async () => {
    const { calls } = renderAdmin('/admin/reportes', {
      api: { 'GET /admin/reports': page(items, { total: 25, total_pages: 3 }) },
    });
    await screen.findByRole('table');
    expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/admin/reports').at(-1).query.page).toBe('2');
    });
  });

  it('shows an empty state for a filter without results and clears the filters', async () => {
    renderAdmin('/admin/reportes?estado=resolved', { api: { 'GET /admin/reports': page([]) } });
    expect(await screen.findByText('Ningún reporte coincide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Aún no hay reportes')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    let attempts = 0;
    renderAdmin('/admin/reportes', {
      api: {
        'GET /admin/reports': () => {
          attempts += 1;
          return attempts === 1 ? apiError(500, 'INTERNAL_ERROR', 'Fallo') : page(items);
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('reports list (mobile cards)', () => {
  it('renders cards instead of a table', async () => {
    restore = stubDesktop(false);
    renderAdmin('/admin/reportes', { api: { 'GET /admin/reports': page(items) } });
    const link = await screen.findByRole('link', { name: 'TD-2026-000001' });
    expect(link).toHaveAttribute('href', '/admin/reportes/r-1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });
});
