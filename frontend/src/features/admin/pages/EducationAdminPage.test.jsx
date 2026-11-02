import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, json } from '../../../test/apiStub.js';
import { page, renderAdmin, sent } from '../../../test/adminTestUtils.jsx';
import { eduItem } from '../../../test/adminFixtures.js';

const categories = [{ slug: 'fauna-marina', name: 'Fauna marina' }];
const published = eduItem();
const draft = eduItem({
  id: 'c-2',
  title: 'Video de ballenas',
  type: 'video',
  media_url: 'https://youtu.be/x',
  is_published: false,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const open = (extra = {}) =>
  renderAdmin('/admin/educacion', {
    api: {
      'GET /admin/edu-contents': page([published, draft]),
      'GET /edu-categories': { data: categories },
      ...extra,
    },
  });

describe('education admin', () => {
  it('lists the contents with type and publication state', async () => {
    open();
    expect(await screen.findByText('Guía de avistamiento')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getAllByText('Sin publicar').length).toBeGreaterThan(0);
    expect(screen.getByText(/Video · Fauna marina/)).toBeInTheDocument();
  });

  it('publishes and unpublishes with one click', async () => {
    const { calls } = open({
      'PATCH /admin/edu-contents/c-2': { data: { ...draft, is_published: true } },
      'PATCH /admin/edu-contents/c-1': { data: { ...published, is_published: false } },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar Video de ballenas' }));
    expect(await screen.findByText(/“Video de ballenas” se publicó/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Despublicar Guía de avistamiento' }));
    expect(await screen.findByText(/“Guía de avistamiento” se despublicó/)).toBeInTheDocument();
    const patches = sent(calls, 'PATCH');
    expect(patches.map((c) => c.body)).toEqual([{ is_published: true }, { is_published: false }]);
  });

  it('filters by publication state and type', async () => {
    const { calls } = open();
    await screen.findByText('Guía de avistamiento');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'false');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'video');
    const last = calls.filter((c) => c.path === '/admin/edu-contents').at(-1);
    expect(last.query).toMatchObject({ published: 'false', type: 'video' });
  });

  describe('form', () => {
    const openForm = async (extra) => {
      const view = open(extra);
      await screen.findByText('Guía de avistamiento');
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo contenido/ }));
      return { ...view, dialog: screen.getByRole('dialog', { name: 'Nuevo contenido' }) };
    };

    it('asks for a URL when the type is video or link', async () => {
      const { dialog, calls } = await openForm();
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Ballenas en el Golfo');
      await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'fauna-marina');
      await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'video');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear contenido' }));
      expect(
        await within(dialog).findByText('Los videos y enlaces necesitan una URL https.'),
      ).toBeInTheDocument();
      expect(sent(calls, 'POST')).toHaveLength(0);
    });

    it('creates an article', async () => {
      const { dialog, calls } = await openForm({
        'POST /admin/edu-contents': () => json({ data: eduItem({ id: 'c-3' }) }, 201),
      });
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Cómo cuidar los arrecifes');
      await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'fauna-marina');
      await userEvent.type(within(dialog).getByLabelText('Texto del artículo'), 'Usa bloqueador mineral.');
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Publicado' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear contenido' }));
      expect(await screen.findByText('Contenido creado.')).toBeInTheDocument();
      expect(sent(calls, 'POST')[0].body).toEqual({
        title: 'Cómo cuidar los arrecifes',
        type: 'article',
        body: 'Usa bloqueador mineral.',
        media_url: null,
        cover_url: null,
        category: 'fauna-marina',
        is_published: true,
      });
    });

    it('shows a server rejection inside the dialog', async () => {
      const { dialog } = await openForm({
        'POST /admin/edu-contents': () =>
          apiError(409, 'SLUG_TAKEN', 'Ya existe un contenido con ese identificador.'),
      });
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Guía repetida');
      await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'fauna-marina');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear contenido' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya existe un contenido');
    });
  });

  it('asks for confirmation before deleting', async () => {
    const { calls } = open({ 'DELETE /admin/edu-contents/c-1': () => new Response(null, { status: 204 }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Guía de avistamiento' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar este contenido?' });
    expect(within(dialog).getByText(/usa “Despublicar”/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar contenido' }));
    expect(await screen.findByText(/se eliminó/)).toBeInTheDocument();
    expect(sent(calls, 'DELETE')).toHaveLength(1);
  });
});
