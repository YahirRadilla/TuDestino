import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider.jsx';
import { apiError, session, stubApi } from '../../../test/apiStub.js';
import ReviewsSection from './ReviewsSection.jsx';

const destination = { slug: 'balandra', name: 'Balandra' };
const review = (id, rating, comment, extra = {}) => ({
  id,
  rating,
  comment,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  ...extra,
});
const listBody = (reviews, total = reviews.length) => ({ data: reviews, meta: { total } });

const renderSection = (props = {}) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ReviewsSection destination={destination} {...props} />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('ReviewsSection', () => {
  it('lists real reviews with the author hidden', async () => {
    stubApi({
      'GET /destinations/balandra/reviews': listBody([review('r1', 5, 'Increíble'), review('r2', 3, null)]),
    });
    renderSection();
    expect(await screen.findByText('Increíble')).toBeInTheDocument();
    expect(screen.getAllByText(/Visitante/)).toHaveLength(2);
    expect(screen.getByRole('img', { name: '5 de 5 estrellas' })).toBeInTheDocument();
    expect(screen.queryByText(/ejemplos/)).not.toBeInTheDocument();
  });

  it('invites anonymous visitors to sign in instead of showing the form', async () => {
    stubApi({ 'GET /destinations/balandra/reviews': listBody([]) });
    renderSection();
    expect(await screen.findByText(/Todavía no hay reseñas/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('shows an offline message with retry when the list cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderSection();
    expect(await screen.findByText('No pudimos cargar las reseñas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('loads more reviews on demand', async () => {
    const api = stubApi({
      'GET /destinations/balandra/reviews': listBody([review('r1', 5, 'Uno')], 12),
    });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver más reseñas' }));
    await waitFor(() => expect(api.count('GET /destinations/balandra/reviews')).toBe(2));
  });

  describe('signed in', () => {
    const signIn = (extra = {}) => {
      localStorage.setItem('td:session', '1');
      return stubApi({
        'POST /auth/refresh': session(),
        'GET /destinations/balandra/reviews': listBody([]),
        'GET /me/reviews': { data: [], meta: {} },
        ...extra,
      });
    };

    it('publishes a review, refreshes the list and reports the new totals', async () => {
      let saved = false;
      const onTotals = vi.fn();
      const api = signIn({
        'GET /destinations/balandra/reviews': () => listBody(saved ? [review('r9', 4, 'Hermosa')] : []),
        'PUT /destinations/balandra/reviews/me': (call) => {
          saved = true;
          return {
            data: review('r9', call.body.rating, call.body.comment),
            meta: { avg_rating: 4, reviews_count: 1 },
          };
        },
      });
      renderSection({ onTotals });
      await userEvent.click(await screen.findByRole('radio', { name: '4 estrellas' }));
      await userEvent.type(screen.getByLabelText(/Comentario/), 'Hermosa');
      await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));

      expect(await screen.findByText('¡Gracias! Tu reseña quedó publicada.')).toBeInTheDocument();
      await waitFor(() => expect(document.querySelector('.reviews')).toHaveTextContent('Hermosa'));
      // After the user's own write the list is revalidated, never read from the HTTP cache.
      const listCalls = api.fetchMock.mock.calls.filter(([url]) => String(url).includes('/reviews?'));
      expect(listCalls.at(-1)[1].cache).toBe('no-cache');
      expect(listCalls[0][1].cache).toBeUndefined();
      expect(onTotals).toHaveBeenCalledWith({ rating: 4, reviews: 1 });
      const put = api.calls.find((c) => c.method === 'PUT');
      expect(put.body).toEqual({ rating: 4, comment: 'Hermosa' });
      expect(await screen.findByRole('button', { name: 'Actualizar reseña' })).toBeInTheDocument();
    });

    it('pre-fills the form with the review the user already wrote', async () => {
      signIn({
        'GET /me/reviews': {
          data: [{ ...review('r1', 2, 'Regular'), destination: { slug: 'balandra', name: 'Balandra' } }],
          meta: {},
        },
      });
      renderSection();
      expect(await screen.findByRole('radio', { name: '2 estrellas' })).toBeChecked();
      expect(screen.getByLabelText(/Comentario/)).toHaveValue('Regular');
      expect(screen.getByRole('heading', { name: 'Tu reseña' })).toBeInTheDocument();
    });

    it('shows the server error without losing what was typed', async () => {
      signIn({
        'PUT /destinations/balandra/reviews/me': apiError(404, 'NOT_FOUND', 'Destino no encontrado.'),
      });
      renderSection();
      await userEvent.click(await screen.findByRole('radio', { name: '5 estrellas' }));
      await userEvent.type(screen.getByLabelText(/Comentario/), 'Texto');
      await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Destino no encontrado.');
      expect(screen.getByLabelText(/Comentario/)).toHaveValue('Texto');
    });
  });
});
