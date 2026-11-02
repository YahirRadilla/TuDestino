import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, json } from '../../../test/apiStub.js';
import { page, renderAdmin, stubDesktop, sent } from '../../../test/adminTestUtils.jsx';
import { destinationItem } from '../../../test/adminFixtures.js';

const categories = [
  { slug: 'playa', name: 'Playas' },
  { slug: 'anp', name: 'Áreas protegidas' },
];
const list = [
  destinationItem(),
  destinationItem({ id: 'd-2', slug: 'borrador', name: 'Sitio en borrador', status: 'draft' }),
];

let restore = () => {};
beforeEach(() => {
  localStorage.clear();
  restore = stubDesktop(true);
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

const open = (extra = {}) =>
  renderAdmin('/admin/destinos', {
    api: {
      'GET /admin/destinations': page(list),
      'GET /destination-categories': { data: categories },
      ...extra,
    },
  });

describe('destinations admin', () => {
  it('lists published and draft destinations with their state', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Destinos' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Playa Balandra')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Publicado')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Borrador')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    open({ 'GET /admin/destinations': page([]) });
    expect(await screen.findByText('Aún no hay destinos')).toBeInTheDocument();
  });

  it('filters by state through the API', async () => {
    const { calls } = open();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'draft');
    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/admin/destinations').at(-1).query.status).toBe('draft');
    });
  });

  describe('create', () => {
    const openForm = async () => {
      const view = open({
        'POST /admin/destinations': () => json({ data: destinationItem({ id: 'd-3' }) }, 201),
      });
      await screen.findByRole('table');
      await waitFor(() => expect(screen.getByRole('button', { name: /Nuevo destino/ })).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: /Nuevo destino/ }));
      return { ...view, dialog: screen.getByRole('dialog', { name: 'Nuevo destino' }) };
    };

    it('validates before calling the API and focuses the first invalid field', async () => {
      const { dialog, calls } = await openForm();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear destino' }));
      expect(
        await within(dialog).findByText('El nombre debe tener entre 2 y 120 caracteres.'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('Elige una categoría.')).toBeInTheDocument();
      expect(within(dialog).getByText('Latitud entre -90 y 90.')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Nombre')).toHaveFocus();
      expect(sent(calls, 'POST')).toHaveLength(0);
    });

    it('creates the destination with coordinates, tips and images, then refreshes the list', async () => {
      const { dialog, calls } = await openForm();
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Playa Nueva');
      await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'playa');
      await userEvent.type(within(dialog).getByLabelText('Latitud'), '24,1426');
      await userEvent.type(within(dialog).getByLabelText('Longitud'), '-110.3128');
      await userEvent.type(within(dialog).getByLabelText(/Consejos de cuidado/), 'Lleva tu basura');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar imagen' }));
      await userEvent.type(within(dialog).getByLabelText('URL de la imagen 1'), '/img/nueva.svg');
      await userEvent.click(within(dialog).getByRole('checkbox', { name: /Área Natural Protegida/ }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear destino' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText('Destino creado.')).toBeInTheDocument();
      expect(sent(calls, 'POST')[0].body).toMatchObject({
        name: 'Playa Nueva',
        category: 'playa',
        lat: 24.1426,
        lng: -110.3128,
        status: 'draft',
        is_protected_area: true,
        care_tips: ['Lleva tu basura'],
        images: [{ url: '/img/nueva.svg', alt_text: null }],
      });
      expect(
        calls.filter((c) => c.path === '/admin/destinations' && c.method === 'GET').length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('shows the server error inside the dialog and keeps the data', async () => {
      const view = open({
        'POST /admin/destinations': () =>
          apiError(409, 'SLUG_TAKEN', 'Ya existe un destino con ese identificador.'),
      });
      await screen.findByRole('table');
      await waitFor(() => expect(screen.getByRole('button', { name: /Nuevo destino/ })).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: /Nuevo destino/ }));
      const dialog = screen.getByRole('dialog', { name: 'Nuevo destino' });
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Playa Nueva');
      await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'playa');
      await userEvent.type(within(dialog).getByLabelText('Latitud'), '24.1');
      await userEvent.type(within(dialog).getByLabelText('Longitud'), '-110.3');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear destino' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Ya existe un destino con ese identificador.',
      );
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Playa Nueva');
      expect(view).toBeDefined();
    });

    it('can be cancelled without saving', async () => {
      const { dialog, calls } = await openForm();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(sent(calls, 'POST')).toHaveLength(0);
    });
  });

  describe('edit', () => {
    it('loads the full record, pre-fills the form and sends a PATCH', async () => {
      const { calls } = open({
        'GET /admin/destinations/d-1': { data: destinationItem() },
        'PATCH /admin/destinations/d-1': { data: destinationItem({ summary: 'Nuevo resumen' }) },
      });
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: 'Editar Playa Balandra' }));
      const dialog = await screen.findByRole('dialog', { name: 'Editar Playa Balandra' });
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Playa Balandra');
      expect(within(dialog).getByLabelText('Latitud')).toHaveValue('24.3');
      expect(within(dialog).getByLabelText('Categoría')).toHaveValue('playa');
      const summary = within(dialog).getByLabelText('Resumen');
      await userEvent.clear(summary);
      await userEvent.type(summary, 'Nuevo resumen');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('Destino actualizado.')).toBeInTheDocument();
      expect(sent(calls, 'PATCH')[0].body).toMatchObject({
        summary: 'Nuevo resumen',
        slug: 'playa-balandra',
      });
    });
  });

  describe('delete', () => {
    it('asks for confirmation and does not delete on cancel', async () => {
      const { calls } = open({ 'DELETE /admin/destinations/d-1': () => new Response(null, { status: 204 }) });
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar Playa Balandra' }));
      const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar este destino?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(sent(calls, 'DELETE')).toHaveLength(0);
    });

    it('deletes after confirming and refreshes the list', async () => {
      const { calls } = open({ 'DELETE /admin/destinations/d-1': () => new Response(null, { status: 204 }) });
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar Playa Balandra' }));
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar destino' }));
      expect(await screen.findByText(/“Playa Balandra” se eliminó/)).toBeInTheDocument();
      expect(sent(calls, 'DELETE')).toHaveLength(1);
    });

    it('shows the failure inside the confirmation', async () => {
      open({ 'DELETE /admin/destinations/d-1': () => apiError(404, 'NOT_FOUND', 'Destino no encontrado.') });
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar Playa Balandra' }));
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar destino' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Destino no encontrado.');
    });
  });
});
