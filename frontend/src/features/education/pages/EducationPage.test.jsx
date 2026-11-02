import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readMirror } from '../../../storage/catalogCache.js';
import { apiError, stubApi } from '../../../test/apiStub.js';
import { filterEduContents } from '../data/offlineEdu.js';
import EducationPage from './EducationPage.jsx';

const content = (slug, title, type, category, extra = {}) => ({
  slug,
  title,
  type,
  body: `Texto de ${title}.\n\nSegundo párrafo.`,
  media_url: null,
  cover_url: null,
  category: { slug: category, name: category === 'fauna' ? 'Fauna marina' : 'Turismo responsable' },
  published_at: '2026-10-01T00:00:00Z',
  ...extra,
});
const ITEMS = [
  content('tortuga', 'Qué hacer si ves una tortuga', 'article', 'fauna'),
  content('ballena', 'La ballena gris', 'video', 'fauna', {
    media_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }),
  content('guia', 'Guía oficial', 'link', 'turismo', { media_url: 'https://www.gob.mx/conanp' }),
];
const CATEGORIES = [
  { slug: 'fauna', name: 'Fauna marina' },
  { slug: 'turismo', name: 'Turismo responsable' },
];

const routes = (list = ITEMS) => ({
  'GET /edu-contents': (call) => ({ data: list, meta: { total: list.length }, call }),
  'GET /edu-categories': { data: CATEGORIES, meta: {} },
});
const renderPage = () =>
  render(
    <MemoryRouter>
      <EducationPage />
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllGlobals());

describe('EducationPage', () => {
  it('shows a loading state and then articles, videos and links', async () => {
    stubApi(routes());
    renderPage();
    expect(screen.getByText('Cargando contenido…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Qué hacer si ves una tortuga' })).toBeInTheDocument();
    expect(screen.getByText('3 resultados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fauna marina' })).not.toBeInTheDocument();
  });

  it('sends only the type filter to the API', async () => {
    const api = stubApi(routes());
    renderPage();
    await screen.findByRole('heading', { name: 'La ballena gris' });
    await userEvent.click(screen.getByRole('button', { name: 'Videos' }));
    await waitFor(() => {
      const last = api.fetchMock.mock.calls
        .filter(([url]) => String(url).includes('/edu-contents'))
        .at(-1)[0];
      expect(last).toContain('type=video');
      expect(last).not.toContain('category=');
    });
  });

  it('debounces the search box into a single request', async () => {
    const api = stubApi(routes());
    renderPage();
    await screen.findByRole('heading', { name: 'La ballena gris' });
    const before = api.count('GET /edu-contents');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar contenido educativo' }), 'ballena');
    await waitFor(() => expect(api.count('GET /edu-contents')).toBe(before + 1));
    const last = api.fetchMock.mock.calls.filter(([url]) => String(url).includes('/edu-contents')).at(-1)[0];
    expect(last).toContain('q=ballena');
  });

  it('expands an article inline and collapses it again (accessible disclosure)', async () => {
    stubApi(routes());
    renderPage();
    const toggle = (await screen.findAllByRole('button', { name: 'Leer' }))[0];
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Segundo párrafo.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Segundo párrafo.')).not.toBeInTheDocument();
  });

  it('loads the video player lazily, only after opening it, with a restricted iframe', async () => {
    stubApi(routes());
    renderPage();
    await screen.findByRole('heading', { name: 'La ballena gris' });
    expect(document.querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ver video' }));
    const frame = document.querySelector('iframe');
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(frame).toHaveAttribute('title', 'Video: La ballena gris');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  });

  it('opens links in a new tab safely and never renders a non-https URL', async () => {
    stubApi(
      routes([
        ...ITEMS,
        content('mal', 'Enlace roto', 'link', 'turismo', { media_url: 'javascript:alert(1)' }),
      ]),
    );
    renderPage();
    const link = await screen.findByRole('link', { name: /Abrir el enlace/ });
    expect(link).toHaveAttribute('href', 'https://www.gob.mx/conanp');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('link', { name: /Abrir el enlace/ })).toHaveLength(1);
  });

  it('has an empty state and an error state with retry', async () => {
    stubApi({ ...routes([]) });
    const first = renderPage();
    expect(await screen.findByText('No encontramos contenido')).toBeInTheDocument();
    first.unmount();

    const api = stubApi({
      'GET /edu-contents': apiError(400, 'VALIDATION_ERROR', 'Mal'),
      'GET /edu-categories': { data: [], meta: {} },
    });
    renderPage();
    expect(await screen.findByText('No pudimos cargar el contenido')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(api.count('GET /edu-contents')).toBe(2));
  });

  describe('offline', () => {
    const visitOnline = async () => {
      stubApi(routes());
      const first = renderPage();
      await screen.findByRole('heading', { name: 'La ballena gris' });
      await waitFor(async () => expect((await readMirror('edu')).items).toHaveLength(3));
      first.unmount();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    };

    it('shows the saved library with the type filters', async () => {
      await visitOnline();
      renderPage();
      expect(await screen.findByRole('heading', { name: 'La ballena gris' })).toBeInTheDocument();
      expect(screen.getByText(/mostrando datos guardados/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Todo' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fauna marina' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Enlaces' }));
      expect(await screen.findByRole('heading', { name: 'Guía oficial' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'La ballena gris' })).not.toBeInTheDocument();
    });

    it('searches the saved library ignoring accents', async () => {
      await visitOnline();
      renderPage();
      await screen.findByRole('heading', { name: 'La ballena gris' });
      await userEvent.type(screen.getByRole('searchbox'), 'que hacer');
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'La ballena gris' })).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('heading', { name: 'Qué hacer si ves una tortuga' })).toBeInTheDocument();
    });

    it('explains there is nothing saved yet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      renderPage();
      expect(
        await screen.findByText(/No pudimos cargar el contenido|Contenido sin conexión/),
      ).toBeInTheDocument();
    });
  });
});

describe('filterEduContents', () => {
  it('filters by category, type and accent-insensitive text, newest first', () => {
    const a = content('a', 'Árbol de mangle', 'article', 'fauna', { published_at: '2026-01-01T00:00:00Z' });
    const b = content('b', 'Otro mangle', 'video', 'fauna', { published_at: '2026-06-01T00:00:00Z' });
    expect(filterEduContents([a, b], { q: 'arbol' }).map((i) => i.slug)).toEqual(['a']);
    expect(filterEduContents([a, b], { q: 'mangle' }).map((i) => i.slug)).toEqual(['b', 'a']);
    expect(filterEduContents([a, b], { type: 'video' }).map((i) => i.slug)).toEqual(['b']);
    expect(filterEduContents([a, b], { category: 'turismo' })).toEqual([]);
  });
});
