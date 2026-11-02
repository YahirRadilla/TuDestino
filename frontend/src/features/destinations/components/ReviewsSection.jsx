import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatShortDay } from '../../../shared/utils/dates.js';
import { useSession } from '../../auth/authContext.js';
import { fetchMyReviews, fetchReviews, saveMyReview } from '../api/reviewsApi.js';
import ReviewForm from './ReviewForm.jsx';
import Stars from './Stars.jsx';

const PAGE = 5;

function ReviewList({ reviews }) {
  return (
    <ul className="reviews">
      {reviews.map((review) => (
        <li key={review.id} className="review">
          <div className="review__head">
            <Stars value={review.rating} />
            <span className="muted">Visitante · {formatShortDay(review.created_at)}</span>
          </div>
          {review.comment && <p>{review.comment}</p>}
        </li>
      ))}
    </ul>
  );
}

function SignInInvite() {
  const location = useLocation();
  return (
    <p className="review-invite">
      <Link to="/login" state={{ from: location }}>
        Inicia sesión
      </Link>{' '}
      para dejar tu reseña.
    </p>
  );
}

// Real reviews for a destination: public list, plus the form for signed-in users.
export default function ReviewsSection({ destination, onTotals }) {
  const { slug } = destination;
  const { isAuthenticated, status } = useSession();
  const [limit, setLimit] = useState(PAGE);
  const [version, setVersion] = useState(0);
  const [mine, setMine] = useState(undefined);
  const [thanks, setThanks] = useState(false);

  const list = useRemoteData({
    key: `${slug}:${limit}:${version}`,
    load: (signal) => fetchReviews(slug, { limit, fresh: version > 0 }, signal),
  });
  // The caller's own review pre-fills the form. Only asked for when there is a session.
  const own = useRemoteData({
    key: `${slug}:mine:${isAuthenticated}`,
    enabled: isAuthenticated,
    load: async (signal) =>
      (await fetchMyReviews(signal)).find((review) => review.destination?.slug === slug) ?? null,
  });
  const current = mine !== undefined ? mine : own.data;

  const submit = async (values) => {
    const { review, totals } = await saveMyReview(slug, values);
    setMine(review);
    setThanks(true);
    setVersion((n) => n + 1);
    onTotals?.(totals);
  };

  const offline = list.error?.kind === 'offline';
  return (
    <section aria-labelledby="resenas">
      <h2 id="resenas" className="detail__h2">
        Reseñas
      </h2>

      {list.status === 'loading' && (
        <div role="status" aria-live="polite">
          <div className="skeleton skeleton--card" aria-hidden="true" />
          <span className="sr-only">Cargando reseñas…</span>
        </div>
      )}
      {list.status === 'error' && (
        <ErrorState
          title={offline ? 'Reseñas sin conexión' : 'No pudimos cargar las reseñas'}
          onRetry={list.reload}
        >
          {offline
            ? 'Las reseñas necesitan conexión. Vuelve a intentarlo cuando tengas señal.'
            : list.error?.message}
        </ErrorState>
      )}
      {list.status === 'ready' && list.data.reviews.length === 0 && (
        <p className="muted">Todavía no hay reseñas. Sé la primera persona en opinar.</p>
      )}
      {list.status === 'ready' && list.data.reviews.length > 0 && (
        <>
          <ReviewList reviews={list.data.reviews} />
          {list.data.total > list.data.reviews.length && (
            <button
              type="button"
              className="btn btn--ghost review-more"
              onClick={() => setLimit((n) => Math.min(n + 10, 50))}
            >
              Ver más reseñas
            </button>
          )}
        </>
      )}

      <div className="review-compose">
        <h3 className="review-compose__title">{current ? 'Tu reseña' : 'Escribe una reseña'}</h3>
        {status === 'loading' && <p className="muted">Verificando tu sesión…</p>}
        {status === 'anonymous' && <SignInInvite />}
        {isAuthenticated && own.status === 'loading' && <p className="muted">Cargando tu reseña…</p>}
        {isAuthenticated && own.status !== 'loading' && (
          <>
            {thanks && (
              <p className="form-success" role="status">
                ¡Gracias! Tu reseña quedó publicada.
              </p>
            )}
            {/* Keyed by id so editing starts from the saved values. */}
            <ReviewForm key={current?.id ?? 'new'} initial={current} onSubmit={submit} />
          </>
        )}
      </div>
    </section>
  );
}
