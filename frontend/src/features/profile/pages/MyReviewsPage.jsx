import { Link } from 'react-router-dom';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatShortDay } from '../../../shared/utils/dates.js';
import { fetchMyReviews } from '../../destinations/api/reviewsApi.js';
import Stars from '../../destinations/components/Stars.jsx';

// HU-T10: the reviews the person wrote. Account data, so it needs the network.
export default function MyReviewsPage() {
  const result = useRemoteData({ key: 'my-reviews', load: (signal) => fetchMyReviews(signal) });

  return (
    <div className="container page">
      <PageHeader title="Mis reseñas" />

      {result.status === 'loading' && <LoadingGrid label="Cargando tus reseñas…" count={2} />}
      {result.status === 'error' && (
        <ErrorState
          title={result.error?.kind === 'offline' ? 'Sin conexión' : 'No pudimos cargar tus reseñas'}
          onRetry={result.reload}
        >
          {result.error?.kind === 'offline'
            ? 'Tus reseñas se consultan en línea. Vuelve a intentarlo cuando tengas señal.'
            : result.error?.message}
        </ErrorState>
      )}
      {result.status === 'ready' && result.data.length === 0 && (
        <StateCard
          icon="star"
          title="Aún no has escrito reseñas"
          action={
            <Link to="/explorar" className="btn btn--primary">
              Explorar destinos
            </Link>
          }
        >
          Cuéntanos cómo te fue en los lugares que visites.
        </StateCard>
      )}
      {result.status === 'ready' && result.data.length > 0 && (
        <ul className="reviews">
          {result.data.map((review) => (
            <li key={review.id} className="review">
              <div className="review__head">
                <Stars value={review.rating} />
                <Link to={`/destinos/${review.destination.slug}`}>{review.destination.name}</Link>
                <span className="muted">{formatShortDay(review.created_at)}</span>
              </div>
              {review.comment && <p>{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
